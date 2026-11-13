import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../metadata/cache';
import { ProviderError } from '../metadata/types';
import { createTmdbExperienceService } from './experience';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('TMDB experience provider', () => {
  it('uses the global all-media trending endpoint and keeps the token in the authorization header', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => response({ results: [{ id: 1 }] }));
    const service = createTmdbExperienceService(fetcher, 'secret-token', new MemoryCache());
    const result = await service.feed({ kind: 'trending', mediaType: 'all', window: 'week', page: 1 });
    expect(result).toEqual({ results: [{ id: 1 }] });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/3/trending/all/week');
    expect(new URL(url).searchParams.get('page')).toBe('1');
    expect(new URL(url).searchParams.has('api_key')).toBe(false);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret-token');
  });

  it('applies genre filters only through the fixed discover endpoint', async () => {
    const fetcher = vi.fn(async (_url: string) => response({ results: [] }));
    const service = createTmdbExperienceService(fetcher, 'token', new MemoryCache());
    await service.feed({ kind: 'discover', mediaType: 'movie', genreIds: ['28'], page: 2 });
    const url = new URL(fetcher.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/3/discover/movie');
    expect(url.searchParams.get('with_genres')).toBe('28');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('supports multi-search, rich details, images, videos, and TV seasons', async () => {
    const fetcher = vi.fn(async (_url: string) => response({ results: [], seasons: [], episodes: [] }));
    const service = createTmdbExperienceService(fetcher, 'token', new MemoryCache());
    await service.search({ query: 'The Matrix', mediaType: 'multi', page: 1 });
    await service.detail('tv', '123');
    await service.images('movie', '456');
    await service.videos('movie', '456');
    await service.seasons('123');
    await service.episodes('123', 2);
    await service.popularPeople(1);
    const urls = fetcher.mock.calls.map((call) => new URL(call[0] as string));
    expect(urls.map((url) => url.pathname)).toEqual([
      '/3/search/multi',
      '/3/tv/123',
      '/3/movie/456/images',
      '/3/movie/456/videos',
      '/3/tv/123',
      '/3/tv/123/season/2',
      '/3/person/popular',
    ]);
    expect(urls[1].searchParams.get('append_to_response')).toContain('recommendations');
  });

  it('rejects invalid IDs and media combinations before contacting TMDB', async () => {
    const fetcher = vi.fn(async (_url: string) => response({}));
    const service = createTmdbExperienceService(fetcher, 'token', new MemoryCache());
    expect(() => service.detail('movie', '../1')).toThrow(ProviderError);
    expect(() => service.feed({ kind: 'popular', mediaType: 'all', page: 1 })).toThrow(ProviderError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('caches successful responses', async () => {
    const fetcher = vi.fn(async (_url: string) => response({ results: [{ id: 5 }] }));
    const service = createTmdbExperienceService(fetcher, 'token', new MemoryCache());
    await service.feed({ kind: 'popular', mediaType: 'movie', page: 1 });
    await service.feed({ kind: 'popular', mediaType: 'movie', page: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
