/** Browser TTL cache for static-ish API payloads (offline-friendly). */

type CacheEntry<T> = { at: number; data: T };

function storageKey(key: string) {
  return `ep_cache:${key}`;
}

export function readClientCache<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed?.at || Date.now() - parsed.at > ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeClientCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry<T> = { at: Date.now(), data };
    localStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

export function invalidateClientCache(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    /* ignore */
  }
}
