/**
 * Simple in-memory TTL cache with in-flight de-duping.
 *
 * Notes:
 * - Per-process cache (fine for single-instance dev; in prod, consider Redis)
 * - Values are stored as-is; do not mutate cached objects after setting
 */

export type CacheGetResult<T> =
  | { hit: true; value: T }
  | { hit: false; value: null };

type Entry<T> = {
  expiresAt: number;
  value: T;
};

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number = 500
  ) {}

  get(key: string): CacheGetResult<T> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry) return { hit: false, value: null };
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return { hit: false, value: null };
    }
    return { hit: true, value: entry.value };
  }

  set(key: string, value: T) {
    const now = Date.now();
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
    this.evictIfNeeded();
  }

  delete(key: string) {
    this.store.delete(key);
    this.inflight.delete(key);
  }

  clear() {
    this.store.clear();
    this.inflight.clear();
  }

  /**
   * Returns cached value if present, otherwise computes, stores, and returns.
   * Concurrent requests for same key share the same in-flight promise.
   */
  async getOrSet(key: string, loader: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const existing = this.get(key);
    if (existing.hit) return { value: existing.value, hit: true };

    const inflight = this.inflight.get(key);
    if (inflight) {
      const value = await inflight;
      return { value, hit: true };
    }

    const p = (async () => {
      const value = await loader();
      this.set(key, value);
      return value;
    })();

    this.inflight.set(key, p);

    try {
      const value = await p;
      return { value, hit: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  private evictIfNeeded() {
    if (this.store.size <= this.maxEntries) return;
    // Basic FIFO eviction (Map preserves insertion order)
    const overflow = this.store.size - this.maxEntries;
    const keys = this.store.keys();
    for (let i = 0; i < overflow; i++) {
      const k = keys.next().value as string | undefined;
      if (!k) break;
      this.store.delete(k);
    }
  }
}

