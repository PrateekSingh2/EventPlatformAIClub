/**
 * Offline Progress Beacon Queue
 * 
 * Persists stage completions, exact completion timestamps, and leaderboard parameters
 * in IndexedDB (with localStorage fallback). When internet is lost or unstable,
 * submissions are queued locally and automatically synced via beacon / keepalive
 * requests upon reconnect, preserving true tournament ranking tie-breakers.
 */

export interface StageProgressPayload {
  accessToken: string;
  stageNumber: number;
  nextStagePassword?: string;
  completedAt: string;         // ISO-8601 string when stage was completed on client
  completedTimestamp: number;  // Epoch milliseconds (Date.now())
  durationSeconds: number;     // Elapsed seconds on client
  pointsAwarded?: number;      // Points for this stage
  answers?: any[];
}

export interface ProgressQueueEntry {
  id?: number;
  localId: string;
  payload: StageProgressPayload;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

export interface ProgressSyncStatus {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncedAt?: number;
  lastError?: string;
}

const DATABASE_NAME = 'event-platform-progress-queue';
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = 'pending-progress';
const LOCAL_STORAGE_KEY = 'pending-stage-progress-v1';
const SUBMIT_ENDPOINT = '/api/stage/submit';
const MAX_BACKOFF_MS = 60 * 1000; // max 1 minute retry interval

let activeFlushPromise: Promise<{ synced: number; remaining: number }> | null = null;
let isCurrentlySyncing = false;
let lastSuccessfulSyncAt: number | undefined;
let lastSyncError: string | undefined;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        db.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open progress queue DB'));
    request.onblocked = () => reject(new Error('Progress queue DB upgrade is blocked'));
  });
}

function readLocalStorageQueue(): ProgressQueueEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalStorageQueue(entries: ProgressQueueEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort storage fallback
  }
}

function createEntry(payload: StageProgressPayload): ProgressQueueEntry {
  const now = Date.now();
  return {
    localId: `prog-${now}-${Math.random().toString(36).slice(2, 9)}`,
    payload,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
  };
}

async function addEntryToIndexedDb(entry: ProgressQueueEntry): Promise<number | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(OBJECT_STORE_NAME);
      const req = store.add(entry);
      req.onsuccess = () => resolve(req.result as number);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
    });
  } finally {
    db.close();
  }
}

async function getIndexedDbEntries(): Promise<ProgressQueueEntry[]> {
  const db = await openDatabase();
  try {
    return await new Promise<ProgressQueueEntry[]>((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE_NAME, 'readonly');
      const store = tx.objectStore(OBJECT_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as ProgressQueueEntry[]) || []);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
  } finally {
    db.close();
  }
}

async function updateIndexedDbEntry(entry: ProgressQueueEntry): Promise<void> {
  if (entry.id === undefined) return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(OBJECT_STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB update failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB update aborted'));
    });
  } finally {
    db.close();
  }
}

async function deleteIndexedDbEntry(id: number): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(OBJECT_STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB delete aborted'));
    });
  } finally {
    db.close();
  }
}

function broadcastStatus(pendingCount: number) {
  if (typeof window === 'undefined') return;
  const detail: ProgressSyncStatus = {
    pendingCount,
    isSyncing: isCurrentlySyncing,
    lastSyncedAt: lastSuccessfulSyncAt,
    lastError: lastSyncError,
  };
  window.dispatchEvent(new CustomEvent('event-platform:progress-sync', { detail }));
}

/**
 * Enqueue a stage completion with exact timestamp into IndexedDB (with localStorage fallback).
 */
export async function enqueueStageProgress(payload: StageProgressPayload): Promise<ProgressQueueEntry> {
  const entry = createEntry(payload);

  try {
    const id = await addEntryToIndexedDb(entry);
    entry.id = id;
  } catch {
    const entries = readLocalStorageQueue();
    entries.push(entry);
    writeLocalStorageQueue(entries);
  }

  // Notify UI
  const total = await getPendingProgressCount();
  broadcastStatus(total);

  // If online, trigger immediate flush
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void flushOfflineProgressQueue();
  }

  return entry;
}

/**
 * Get count of all pending submissions in queue.
 */
export async function getPendingProgressCount(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  try {
    const entries = await getIndexedDbEntries();
    const local = readLocalStorageQueue();
    const knownIds = new Set(entries.map((e) => e.localId));
    const extraLocal = local.filter((e) => !knownIds.has(e.localId));
    return entries.length + extraLocal.length;
  } catch {
    return readLocalStorageQueue().length;
  }
}

/**
 * Retrieve all pending entries.
 */
export async function getAllPendingEntries(): Promise<ProgressQueueEntry[]> {
  if (typeof window === 'undefined') return [];
  try {
    const indexedEntries = await getIndexedDbEntries();
    const localEntries = readLocalStorageQueue();
    const knownIds = new Set(indexedEntries.map((e) => e.localId));
    const uniqueLocal = localEntries.filter((e) => !knownIds.has(e.localId));
    return [...indexedEntries, ...uniqueLocal];
  } catch {
    return readLocalStorageQueue();
  }
}

function calculateRetryDelay(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 1500 * Math.pow(2, Math.min(attempts, 6)));
}

async function sendProgressEntry(entry: ProgressQueueEntry): Promise<boolean> {
  try {
    const response = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: entry.payload.accessToken,
        stageNumber: entry.payload.stageNumber,
        nextStagePassword: entry.payload.nextStagePassword,
        completedAt: entry.payload.completedAt,
        completedTimestamp: entry.payload.completedTimestamp,
        durationSeconds: entry.payload.durationSeconds,
        answers: entry.payload.answers || [0, 0],
        points: entry.payload.pointsAwarded,
      }),
      keepalive: true,
    });

    const result = await response.json().catch(() => ({}));
    if (response.ok && (result.success === true || result.alreadyCompleted === true)) {
      return true;
    }
    lastSyncError = result.error || `HTTP ${response.status}`;
    return false;
  } catch (err: any) {
    lastSyncError = err.message || 'Network unreachable';
    return false;
  }
}

/**
 * Flush all pending stage submissions to server.
 */
async function processQueue(): Promise<{ synced: number; remaining: number }> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    const count = await getPendingProgressCount();
    broadcastStatus(count);
    return { synced: 0, remaining: count };
  }

  isCurrentlySyncing = true;
  let synced = 0;

  try {
    let localEntries = readLocalStorageQueue();
    let indexedEntries: ProgressQueueEntry[] = [];
    let isIdbAvailable = true;

    try {
      indexedEntries = await getIndexedDbEntries();
      // Sync local storage entries into IndexedDB if available
      if (localEntries.length > 0) {
        const knownIds = new Set(indexedEntries.map((e) => e.localId));
        for (const localEntry of localEntries) {
          if (!knownIds.has(localEntry.localId)) {
            await addEntryToIndexedDb(localEntry);
          }
        }
        writeLocalStorageQueue([]);
        indexedEntries = await getIndexedDbEntries();
      }
    } catch {
      isIdbAvailable = false;
    }

    const entries = isIdbAvailable ? indexedEntries : localEntries;
    const now = Date.now();
    let remainingLocalQueue = isIdbAvailable ? [] : [...localEntries];

    // Sort by completion timestamp so earlier completions are submitted first
    entries.sort((a, b) => a.payload.completedTimestamp - b.payload.completedTimestamp);

    for (const entry of entries) {
      if (entry.nextAttemptAt > now) continue;

      const success = await sendProgressEntry(entry);
      if (success) {
        synced++;
        lastSuccessfulSyncAt = Date.now();
        lastSyncError = undefined;

        if (isIdbAvailable && entry.id !== undefined) {
          await deleteIndexedDbEntry(entry.id);
        } else {
          remainingLocalQueue = remainingLocalQueue.filter((e) => e.localId !== entry.localId);
        }
      } else {
        entry.attempts += 1;
        entry.lastError = lastSyncError;
        entry.nextAttemptAt = Date.now() + calculateRetryDelay(entry.attempts);

        if (isIdbAvailable && entry.id !== undefined) {
          await updateIndexedDbEntry(entry);
        } else {
          remainingLocalQueue = remainingLocalQueue.map((e) => (e.localId === entry.localId ? entry : e));
        }

        if (!navigator.onLine) break;
      }
    }

    if (!isIdbAvailable) {
      writeLocalStorageQueue(remainingLocalQueue);
    }

    const remaining = await getPendingProgressCount();
    isCurrentlySyncing = false;
    broadcastStatus(remaining);

    if (synced > 0) {
      // Notify components to update rankings & live leaderboard
      window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
    }

    return { synced, remaining };
  } catch (err: any) {
    lastSyncError = err.message || 'Queue processing error';
    isCurrentlySyncing = false;
    const remaining = await getPendingProgressCount();
    broadcastStatus(remaining);
    return { synced, remaining };
  }
}

export function flushOfflineProgressQueue(): Promise<{ synced: number; remaining: number }> {
  if (!activeFlushPromise) {
    activeFlushPromise = processQueue().finally(() => {
      activeFlushPromise = null;
    });
  }
  return activeFlushPromise;
}

/**
 * Setup lifecycle listeners to keep queue synced automatically.
 */
let isListenersInitialized = false;

export function initializeProgressQueueListeners(): () => void {
  if (typeof window === 'undefined' || isListenersInitialized) {
    return () => {};
  }

  isListenersInitialized = true;

  const triggerFlush = () => {
    if (navigator.onLine) {
      void flushOfflineProgressQueue();
    }
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      triggerFlush();
    }
  };

  // Periodic retry interval (every 8 seconds)
  const intervalId = window.setInterval(triggerFlush, 8000);

  window.addEventListener('online', triggerFlush);
  window.addEventListener('pageshow', triggerFlush);
  document.addEventListener('visibilitychange', handleVisibility);

  // Attempt sendBeacon / keepalive on page departure
  const handlePageDeparture = () => {
    void flushOfflineProgressQueue();
  };
  window.addEventListener('beforeunload', handlePageDeparture);
  window.addEventListener('pagehide', handlePageDeparture);

  // Initial flush on load
  triggerFlush();

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener('online', triggerFlush);
    window.removeEventListener('pageshow', triggerFlush);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('beforeunload', handlePageDeparture);
    window.removeEventListener('pagehide', handlePageDeparture);
    isListenersInitialized = false;
  };
}

/**
 * React hook / component helper to subscribe to queue sync status.
 */
export function subscribeProgressSyncStatus(callback: (status: ProgressSyncStatus) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleEvent = (event: Event) => {
    const custom = event as CustomEvent<ProgressSyncStatus>;
    if (custom.detail) {
      callback(custom.detail);
    }
  };

  window.addEventListener('event-platform:progress-sync', handleEvent);

  // Send initial count
  void getPendingProgressCount().then((count) => {
    callback({
      pendingCount: count,
      isSyncing: isCurrentlySyncing,
      lastSyncedAt: lastSuccessfulSyncAt,
      lastError: lastSyncError,
    });
  });

  return () => {
    window.removeEventListener('event-platform:progress-sync', handleEvent);
  };
}
