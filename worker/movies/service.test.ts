import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../metadata/cache';
import type { MovieCatalogProvider, MoviePage } from './types';
import { createMovieCatalogService } from './service';
import { ProviderError } from '../metadata/types';

const page: MoviePage = { items: [], page: 1, totalPages: 0, totalResults: 0 };

function provider(overrides: Partial<MovieCatalogProvider> = {}): MovieCatalogProvider {
  return {
    id: 'tmdb',
    displayName: 'TMDB',
    termsVerified: false,
    attribution: { providerId: 'tmdb', displayName: 'TMDB', text: '', url: '', termsUrl: '', requirements: [] },
    discover: async () => page,
    search: async () => page,
    byId: async () => { throw new ProviderError('not_found', 'missing'); },
    genres: async () => [],
    ...overrides,
  };
}

describe('Movies catalogue service', () => {
  it('caches discovery pages and reuses fresh data', async () => {
    let calls = 0;
    let now = 1_000_000;
    const service = createMovieCatalogService(provider({ discover: async () => { calls += 1; return page; } }), new MemoryCache(() => now), () => now);
    const query = { kind: 'popular' as const, page: 1 };
    expect((await service.discover(query)).cache).toBe('miss');
    expect((await service.discover(query)).cache).toBe('hit');
    expect(calls).toBe(1);
  });

  it('serves stale cached discovery if the provider fails temporarily', async () => {
    let now = 1_000_000;
    let fail = false;
    const service = createMovieCatalogService(provider({
      discover: async () => {
        if (fail) throw new ProviderError('unavailable', 'temporarily down');
        return page;
      },
    }), new MemoryCache(() => now), () => now);
    const query = { kind: 'popular' as const, page: 1 };
    await service.discover(query);
    now += 21 * 60 * 1000;
    fail = true;
    expect((await service.discover(query)).cache).toBe('stale');
  });

  it('does not hide provider failure when no stale response is available', async () => {
    const service = createMovieCatalogService(provider({
      search: async () => { throw new ProviderError('rate_limited', 'slow down', 30); },
    }), new MemoryCache());
    await expect(service.search({ query: 'Dune', page: 1 })).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});
