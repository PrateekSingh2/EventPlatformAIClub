/**
 * In-Browser Stage Archive Cache (IndexedDB)
 * 
 * Stores downloaded encrypted stage ZIP blobs and metadata directly in client IndexedDB.
 * Allows participants who lose internet connectivity to verify passwords and open
 * stage challenge files in RAM without blocking their progress.
 */

interface CachedStageRecord {
  stageNumber: number;
  blob: Blob;
  title?: string;
  allowedCopyFilename?: string;
  cachedAt: number;
}

const DB_NAME = 'event-platform-stage-cache';
const DB_VERSION = 1;
const STORE_NAME = 'stage-archives';

function openStageCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'stageNumber' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open stage cache DB'));
  });
}

export async function saveStageArchive(
  stageNumber: number,
  blob: Blob,
  meta?: { title?: string; allowedCopyFilename?: string }
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openStageCacheDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: CachedStageRecord = {
      stageNumber,
      blob,
      title: meta?.title,
      allowedCopyFilename: meta?.allowedCopyFilename,
      cachedAt: Date.now(),
    };
    store.put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[StageCache] Could not save stage archive to IndexedDB:', err);
  }
}

export async function getCachedStageArchive(
  stageNumber: number
): Promise<{ blob: Blob; title?: string; allowedCopyFilename?: string } | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await openStageCacheDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(stageNumber);
    const result = await new Promise<CachedStageRecord | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!result) return null;
    return {
      blob: result.blob,
      title: result.title,
      allowedCopyFilename: result.allowedCopyFilename,
    };
  } catch {
    return null;
  }
}
