import type { MetadataCache } from '../metadata/cache';
import { ProviderError } from '../metadata/types';
import type {
  MovieCatalogProvider,
  MovieDetail,
  MovieDiscoverQuery,
  MovieGenre,
  MoviePage,
  MovieSearchQuery,
} from './types';

type CacheEntry<T> = { value: T; freshUntil: number; staleUntil: number };
export type MovieCacheState = 'hit' | 'miss' | 'stale';
export type MovieServiceResult<T> = { data: T; cache: MovieCacheState };

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

/** A cache is only a temporary accelerator; it is not the Movies database. */
export function createMovieCatalogService(
  provider: MovieCatalogProvider,
  cache: MetadataCache,
  now: () => number = Date.now,
  timeoutMs = 8000,
) {
  async function resolve<T>(key: string, freshSeconds: number, staleSeconds: number, run: (signal: AbortSignal) => Promise<T>): Promise<MovieServiceResult<T>> {
    const cacheKey = `movies:${key}`;
    const cached = await cache.get<CacheEntry<T>>(cacheKey);
    if (cached && cached.freshUntil > now()) return { data: cached.value, cache: 'hit' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const data = await run(controller.signal);
      await cache.put(cacheKey, {
        value: data,
        freshUntil: now() + freshSeconds * 1000,
        staleUntil: now() + staleSeconds * 1000,
      } satisfies CacheEntry<T>, staleSeconds);
      return { data, cache: 'miss' };
    } catch (error) {
      if (cached && cached.staleUntil > now()) return { data: cached.value, cache: 'stale' };
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('unavailable', 'The Movies metadata provider is unavailable.');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    discover(query: MovieDiscoverQuery) {
      const key = `discover:${hash(JSON.stringify(query))}`;
      return resolve<MoviePage>(key, 20 * 60, 24 * 60 * 60, (signal) => provider.discover(query, signal));
    },
    search(query: MovieSearchQuery) {
      const normalized = { ...query, query: query.query.trim().replace(/\s+/g, ' ').toLocaleLowerCase() };
      const key = `search:${hash(JSON.stringify(normalized))}`;
      return resolve<MoviePage>(key, 5 * 60, 60 * 60, (signal) => provider.search(query, signal));
    },
    byId(externalId: string) {
      const key = `detail:${hash(externalId)}`;
      return resolve<MovieDetail>(key, 6 * 60 * 60, 24 * 60 * 60, (signal) => provider.byId(externalId, signal));
    },
    genres(language: string) {
      const key = `genres:${hash(language)}`;
      return resolve<MovieGenre[]>(key, 24 * 60 * 60, 7 * 24 * 60 * 60, (signal) => provider.genres(language, signal));
    },
  };
}
