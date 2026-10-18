export interface OfflineTelemetryPayload {
  accessToken: string;
  stageNumber: number;
  type:
    | 'tab_switch'
    | 'fullscreen_exit'
    | 'multi_monitor_detected'
    | 'devtools_timing'
    | 'window_size_discrepancy';
  latencyMs?: number;
}

interface QueueEntry {
  id?: number;
  localId?: string;
  payload: OfflineTelemetryPayload;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
}

const DATABASE_NAME = 'event-platform-telemetry';
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = 'pending-pings';
const LOCAL_STORAGE_KEY = 'pending-stage-telemetry-v1';
const PING_ENDPOINT = '/api/stage/telemetry-ping';
const MAX_BACKOFF_MS = 5 * 60 * 1000;

let activeFlush: Promise<void> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        database.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open telemetry queue'));
    request.onblocked = () => reject(new Error('Telemetry queue database upgrade is blocked'));
  });
}

function readLocalQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeLocalQueue(entries: QueueEntry[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
}

function makeEntry(payload: OfflineTelemetryPayload): QueueEntry {
  const now = Date.now();
  return {
    localId: `${now}-${Math.random().toString(36).slice(2)}`,
    payload,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
  };
}

async function addToIndexedDb(entry: QueueEntry) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE_NAME, 'readwrite');
      transaction.objectStore(OBJECT_STORE_NAME).add(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Queue write failed'));
      transaction.onabort = () => reject(transaction.error || new Error('Queue write aborted'));
    });
  } finally {
    database.close();
  }
}

async function getIndexedDbEntries(): Promise<QueueEntry[]> {
  const database = await openDatabase();
  try {
    return await new Promise<QueueEntry[]>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE_NAME, 'readonly');
      const request = transaction.objectStore(OBJECT_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as QueueEntry[]);
      request.onerror = () => reject(request.error || new Error('Queue read failed'));
    });
  } finally {
    database.close();
  }
}

async function updateIndexedDbEntry(entry: QueueEntry) {
  if (entry.id === undefined) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE_NAME, 'readwrite');
      transaction.objectStore(OBJECT_STORE_NAME).put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Queue update failed'));
      transaction.onabort = () => reject(transaction.error || new Error('Queue update aborted'));
    });
  } finally {
    database.close();
  }
}

async function deleteIndexedDbEntry(id: number) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE_NAME, 'readwrite');
      transaction.objectStore(OBJECT_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Queue delete failed'));
      transaction.onabort = () => reject(transaction.error || new Error('Queue delete aborted'));
    });
  } finally {
    database.close();
  }
}

export async function enqueueTelemetryPing(payload: OfflineTelemetryPayload) {
  if (typeof window === 'undefined') return;
  const entry = makeEntry(payload);
  try {
    await addToIndexedDb(entry);
  } catch {
    const entries = readLocalQueue();
    entries.push(entry);
    writeLocalQueue(entries);
  }
}

function getRetryDelay(attempts: number) {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts, 8));
}

async function sendEntry(entry: QueueEntry) {
  try {
    const response = await fetch(PING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry.payload),
      keepalive: true,
    });
    const result = await response.json().catch(() => ({}));
    return response.ok && result.ok === true;
  } catch {
    return false;
  }
}

async function flushQueue() {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  const localEntries = readLocalQueue();
  let indexedEntries: QueueEntry[] = [];
  let indexedDbAvailable = true;
  try {
    indexedEntries = await getIndexedDbEntries();
    if (localEntries.length > 0) {
      const knownLocalIds = new Set(indexedEntries.map((entry) => entry.localId));
      for (const entry of localEntries) {
        if (!knownLocalIds.has(entry.localId)) await addToIndexedDb(entry);
      }
      writeLocalQueue([]);
      indexedEntries = await getIndexedDbEntries();
    }
  } catch {
    indexedDbAvailable = false;
  }

  const entries = indexedDbAvailable ? indexedEntries : localEntries;
  const now = Date.now();
  let localQueue = indexedDbAvailable ? [] : localEntries;

  for (const entry of entries) {
    if (entry.nextAttemptAt > now) continue;
    const sent = await sendEntry(entry);
    if (sent) {
      if (indexedDbAvailable && entry.id !== undefined) {
        await deleteIndexedDbEntry(entry.id);
      } else {
        localQueue = localQueue.filter((candidate) => candidate.localId !== entry.localId);
      }
      continue;
    }

    entry.attempts += 1;
    entry.nextAttemptAt = Date.now() + getRetryDelay(entry.attempts);
    try {
      if (indexedDbAvailable) await updateIndexedDbEntry(entry);
      else localQueue = localQueue.map((candidate) => candidate.localId === entry.localId ? entry : candidate);
    } catch {
      indexedDbAvailable = false;
      if (entry.id === undefined && !localQueue.some((candidate) => candidate.localId === entry.localId)) {
        localQueue.push(entry);
      } else {
        localQueue = localQueue.map((candidate) => candidate.localId === entry.localId ? entry : candidate);
      }
    }

    if (!navigator.onLine) break;
  }

  if (!indexedDbAvailable) {
    try {
      writeLocalQueue(localQueue);
    } catch {
      // Keep the queue best-effort if browser storage is full or disabled.
    }
  }
}

export function flushOfflineTelemetryQueue() {
  if (!activeFlush) {
    activeFlush = flushQueue().finally(() => {
      activeFlush = null;
    });
  }
  return activeFlush;
}
