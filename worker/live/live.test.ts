import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../metadata/cache';
import { CircuitBreaker } from '../metadata/breaker';
import type { ArtworkProvider } from '../artwork/tmdb';
import { Pacer } from './pacer';
import { createMalSource, mapMalAnime } from './mal';
import { buildDeps, type Deps } from './service';
import { createLiveHandlers, parseBrowse, currentSeason } from './handlers';
import { makeSlug, parseRef, slugify } from './ids';
import type { LiveRequest } from './types';

const NOW = '2026-11-24T00:00:00.000Z';
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
const instant = new Pacer(0, Date.now, async () => {});
const malAnime = (id: number, extra: Record<string, unknown> = {}) => ({
  id, title: 'Title ' + id,
  alternative_titles: { en: 'English ' + id, ja: '日本語 ' + id, synonyms: ['Alias ' + id] },
  start_date: '2026-10-04', start_season: { year: 2026, season: 'fall' },
  mean: 8.45, media_type: 'tv', status: 'currently_airing', num_episodes: 12,
  nsfw: 'white', rating: 'pg_13', genres: [{ id: 1, name: 'Action' }],
  synopsis: 'A story with HTML <b>stripped</b>.', ...extra,
});
const page = (items: unknown[]) => json({ data: items.map((node) => ({ node })), paging: {} });

function deps(handler: (url: string, init?: RequestInit) => Promise<Response>, over: Partial<Deps> = {}): Deps {
  return {
    sources: [createMalSource(handler, 'test-client-id', { pacer: instant, now: () => NOW })],
    episodeProviders: [], unknownEpisodeProviders: [],
    cache: new MemoryCache(), breaker: new CircuitBreaker(), now: Date.now,
    ...over,
  };
}
const req = (query: Record<string, string> = {}, params: Record<string, string> = {}, env: LiveRequest['env'] = {}): LiveRequest =>
  ({ query, param: (n) => params[n], requestId: 'r1', env });
const call = (d: Deps, name: keyof ReturnType<typeof createLiveHandlers>, r: LiveRequest) =>
  createLiveHandlers(async () => json({}), () => d)[name](r);

describe('live catalogue provider configuration', () => {
  it('reports MAL as the sole catalogue provider and episodes separately', async () => {
    const response = await call(deps(async () => page([])), 'providers', req());
    expect(response.body).toMatchObject({ data: { items: [{ id: 'mal', displayName: 'MyAnimeList' }], episodeProviders: [] } });
  });

  it('fails closed and reports no catalogue provider when MAL_CLIENT_ID is absent', async () => {
    const unconfigured = buildDeps({ EPISODE_PROVIDERS: '' }, async () => { throw new Error('must not fetch'); });
    expect(unconfigured.sources).toEqual([]);
    const response = await call(unconfigured, 'providers', req());
    expect(response.body).toMatchObject({ data: { items: [] } });
    const trending = await call(unconfigured, 'trending', req());
    expect(trending.status).toBe(503);
    expect(trending.body).toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE' } });
  });
});

describe('MAL catalogue IDs and mapping', () => {
  it('slugifies and parses MAL-native references', () => {
    expect(slugify('Fullmetal Alchemist: Brotherhood!')).toBe('fullmetal-alchemist-brotherhood');
    expect(slugify('進撃の巨人')).toBe('anime');
    expect(makeSlug('Death Note', 'm', 1535)).toBe('death-note-m1535');
    expect(parseRef('death-note-m1535')).toEqual({ kind: 'm', id: 1535 });
    expect(parseRef('death-note-8-h8')).toEqual({ kind: 'h', id: 8, slug: 'death-note-8' });
    expect(parseRef('x1')).toBeNull();
    expect(parseRef('m0')).toBeNull();
  });

  it('maps MAL metadata while leaving artwork slots empty for TMDB', () => {
    const mapped = mapMalAnime(malAnime(42), NOW);
    expect(mapped).toMatchObject({
      provider: 'mal', externalId: '42', ids: { mal: '42' }, title: 'English 42',
      format: 'series', status: 'airing', season: 'fall', year: 2026,
      episodeCount: 12, genres: ['Action'], rating: 8.5,
      posterUrl: null, bannerUrl: null, synopsis: 'A story with HTML stripped.',
    });
  });
});

describe('MAL-backed live handlers', () => {
  it('fetches featured titles from MAL using the registered Client ID and adds TMDB-only artwork', async () => {
    let requestedUrl = '';
    let clientId = '';
    const artworkProvider: ArtworkProvider = {
      id: 'tmdb',
      lookup: async () => ({
        tmdbId: 1429, mediaType: 'tv',
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      }),
    };
    const d = deps(async (url, init) => {
      requestedUrl = url;
      clientId = new Headers(init?.headers).get('X-MAL-CLIENT-ID') ?? '';
      return page([malAnime(101)]);
    }, { artworkProvider });
    const response = await call(d, 'featured', req());
    expect(new URL(requestedUrl).origin + new URL(requestedUrl).pathname).toBe('https://api.myanimelist.net/v2/anime/ranking');
    expect(clientId).toBe('test-client-id');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [{ id: 'm101', title: 'English 101', synopsis: 'A story with HTML stripped.', posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg', bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg' }] },
      meta: { requestId: 'r1', source: 'mal', artworkProvider: 'tmdb' },
    });
  });

  it('keeps MAL authoritative for synopsis, score, genres and episode count', async () => {
    const artworkProvider: ArtworkProvider = {
      id: 'tmdb',
      lookup: async () => ({
        tmdbId: 1429, mediaType: 'tv',
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      }),
    };
    const d = deps(async () => json({ data: malAnime(102) }), { artworkProvider });
    const response = await call(d, 'anime', req({}, { id: 'm102' }));
    expect(response.body).toMatchObject({
      data: {
        id: 'm102', synopsis: 'A story with HTML stripped.', rating: 8.5,
        genres: ['Action'], episodeCount: 12,
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      },
    });
  });
});

describe('browse parsing', () => {
  it('uses UTC season boundaries for the current season', () => {
    expect(currentSeason(new Date('2026-01-01T00:00:00Z'))).toEqual({ season: 'winter', year: 2026 });
    expect(currentSeason(new Date('2026-07-01T00:00:00Z'))).toEqual({ season: 'summer', year: 2026 });
    expect(parseBrowse({ season: 'current', page: '1', limit: '24' }, new Date('2026-11-24T00:00:00Z'))).toMatchObject({
      ok: true, value: { season: 'fall', year: 2026, page: 1, limit: 24 },
    });
  });
});