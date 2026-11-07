// Short-lived cache for provider responses. This is a cache, not a store: every entry expires, nothing is written to D1,
// which keeps KAIRO inside AniList's rule against using its API as backup or data storage.
export interface MetadataCache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export class MemoryCache implements MetadataCache {
  private store = new Map<string, { value: unknown; expires: number }>();
  constructor(private now: () => number = Date.now) {}
  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expires <= this.now()) { this.store.delete(key); return null; }
    return hit.value as T;
  }
  async put(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
  }
}

/** Workers KV with expirationTtl. Works on workers.dev. KV's minimum TTL is 60 seconds. */
export interface KvLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}
export class KvCache implements MetadataCache {
  constructor(private kv: KvLike, private prefix = 'kairo:') {}
  async get<T>(key: string): Promise<T | null> {
    try { return ((await this.kv.get(this.prefix + key, 'json')) as T | null) ?? null; } catch { return null; }
  }
  async put(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try { await this.kv.put(this.prefix + key, JSON.stringify(value), { expirationTtl: Math.max(60, Math.floor(ttlSeconds)) }); } catch { /* a cache write failure must never fail a request */ }
  }
}

/** Cloudflare Cache API. Per Cloudflare's docs it has no effect on *.workers.dev and does not replicate between data centres. */
export class EdgeCache implements MetadataCache {
  constructor(private cache: { match(r: Request): Promise<Response | undefined>; put(r: Request, res: Response): Promise<void> }) {}
  private req = (key: string) => new Request(`https://cache.kairo.invalid/${encodeURIComponent(key)}`);
  async get<T>(key: string): Promise<T | null> {
    try {
      const hit = await this.cache.match(this.req(key));
      return hit ? ((await hit.json()) as T) : null;
    } catch { return null; }
  }
  async put(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.cache.put(this.req(key), new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.floor(ttlSeconds)}` } }));
    } catch { /* ignore */ }
  }
}

export type CacheTtls = { hitSeconds: number; missSeconds: number; errorSeconds: number };
export const DEFAULT_TTLS: CacheTtls = { hitSeconds: 6 * 3600, missSeconds: 3600, errorSeconds: 60 };
