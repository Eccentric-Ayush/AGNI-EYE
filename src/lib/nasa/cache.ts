/**
 * Simple in-memory TTL cache with stale-while-error support.
 * On upstream failure, stale entries can still be served.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  storedAt: number;
}

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): { value: T; age: number } | null {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return null;
  const age = Date.now() - e.storedAt;
  return { value: e.value, age };
}

export function cacheGetFresh<T>(key: string, ttlMs: number): { value: T; age: number } | null {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return null;
  const age = Date.now() - e.storedAt;
  if (age > ttlMs) return null;
  return { value: e.value, age };
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, { value, expiresAt: Date.now(), storedAt: Date.now() });
  // opportunistic cleanup
  if (store.size > 500) {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [k, v] of store) {
      if (v.storedAt < cutoff) store.delete(k);
    }
  }
}

export const CACHE_TTL = {
  fires: 5 * 60 * 1000, // GIBS tiles refresh ~ every few hours; 5 min keeps UI fresh
  eonet: 10 * 60 * 1000,
  status: 60 * 1000,
};
