// FIXTURES BELOW ARE HAND-WRITTEN from each provider's documented response shape. They are NOT captured live responses.
// Run the first live check in docs/LIVE_CATALOGUE.md before trusting the adapters.
import { describe, it, expect } from 'vitest';
import { MemoryCache } from '../metadata/cache';
import type { ArtworkProvider } from '../artwork/tmdb';
import { CircuitBreaker } from '../metadata/breaker';
import { createAniListSource, buildPageQuery } from './anilist';
import { createJikanSource, mapJikanAnime, Pacer } from './jikan';
import { createJikanEpisodeProvider } from '../episodes/providers/jikan';
import { createLiveHandlers, parseBrowse, currentSeason } from './handlers';
import { makeSlug, parseRef, slugify } from './ids';
import type { Deps } from './service';
import type { CatalogSource, LiveTitle } from './types';
import type { LiveRequest } from './types';

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
const signal = new AbortController().signal;
const NOW = '2026-11-07T00:00:00.000Z';

const media = (id: number, extra: Record<string, unknown> = {}) => ({
  id, idMal: id + 1000, siteUrl: `https://anilist.co/anime/${id}`, isAdult: false, title: { romaji: `Title ${id}`, english: `Title ${id}`, native: null }, synonyms: [],
  description: 'A <b>story</b>.', format: 'TV', status: 'RELEASING', episodes: 12, season: 'FALL', seasonYear: 2026, startDate: { year: 2026 }, genres: ['Action'],
  averageScore: 80, coverImage: { extraLarge: `https://img.test/${id}.jpg` }, bannerImage: null, ...extra,
});
const aniPage = (items: unknown[], extra: Record<string, unknown> = {}) => json({ data: { Page: { pageInfo: { total: items.length, hasNextPage: false, ...extra }, media: items } } });
const jikanAnime = (id: number, extra: Record<string, unknown> = {}) => ({
  mal_id: id, url: `https://myanimelist.net/anime/${id}`, images: { jpg: { large_image_url: `https://cdn.test/${id}.jpg` } }, title: `Jikan ${id}`, title_english: null, title_japanese: 'ジ',
  title_synonyms: [], type: 'TV', episodes: 24, status: 'Currently Airing', aired: { prop: { from: { year: 2026 } } }, score: 7.84, synopsis: 'Hello. [Written by MAL Rewrite]',
  rating: 'PG-13 - Teens 13 or older', season: 'fall', year: 2026, genres: [{ name: 'Comedy' }], ...extra,
});
const jikanList = (items: unknown[]) => json({ data: items, pagination: { has_next_page: true, items: { total: 99 } } });

const instant = new Pacer(0, Date.now, async () => {});
function deps(handler: (url: string, init?: RequestInit) => Promise<Response>, over: Partial<Deps> = {}): Deps {
  const f = (url: string, init?: RequestInit) => handler(url, init);
  return {
    sources: [createAniListSource(f, () => NOW), createJikanSource(f, { pacer: instant, now: () => NOW })],
    episodeProviders: [createJikanEpisodeProvider(f, async () => {})], unknownEpisodeProviders: [],
    cache: new MemoryCache(), breaker: new CircuitBreaker(), now: Date.now, ...over,
  };
}
const req = (query: Record<string, string> = {}, params: Record<string, string> = {}): LiveRequest => ({ query, param: (n) => params[n], requestId: 'r1', env: {} });
const call = (d: Deps, name: keyof ReturnType<typeof createLiveHandlers>, r: LiveRequest) => createLiveHandlers(async () => json({}), () => d)[name](r);
const isAni = (url: string) => url === 'https://graphql.anilist.co';

describe('ids', () => {
  it('slugifies and parses refs', () => {
    expect(slugify('Fullmetal Alchemist: Brotherhood!')).toBe('fullmetal-alchemist-brotherhood');
    expect(slugify('進撃の巨人')).toBe('anime');
    expect(makeSlug('Death Note', 'a', 1535)).toBe('death-note-a1535');
    expect(parseRef('death-note-a1535')).toEqual({ kind: 'a', id: 1535 });
    expect(parseRef('m21')).toEqual({ kind: 'm', id: 21 });
    expect(parseRef('death-note-8-h8')).toEqual({ kind: 'h', id: 8, slug: 'death-note-8' });
    expect(parseRef('x1')).toBeNull();
    expect(parseRef('a0')).toBeNull();
    expect(parseRef('death-note')).toBeNull();
  });
});

describe('AniList source', () => {
  it('builds queries with only the variables that are set and always excludes adult titles', () => {
    const q = buildPageQuery([{ name: 'genre', gqlType: 'String', value: 'Action' }], 2, 24);
    expect(q.query).toContain('isAdult: false');
    expect(q.query).toContain('genre: $genre');
    expect(q.query).not.toContain('$search');
    expect(q.variables).toEqual({ page: 2, perPage: 24, genre: 'Action' });
  });
  it('rotates the featured lineup to a different trending page and starting title each UTC day', async () => {
    let day = '2026-11-10T00:00:00.000Z';
    const pages: number[] = [];
    const source = createAniListSource(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { variables: { page: number } };
      pages.push(body.variables.page);
      return aniPage([
        media(1, { bannerImage: 'https://img.test/1-banner.jpg' }),
        media(2, { bannerImage: 'https://img.test/2-banner.jpg' }),
      ]);
    }, () => day);
    const first = await source.list('featured', 1, 12, signal);
    day = '2026-11-11T00:00:00.000Z';
    const second = await source.list('featured', 1, 12, signal);
    expect(pages[0]).not.toBe(pages[1]);
    expect(first.items[0]?.card.id).not.toBe(second.items[0]?.card.id);
  });
  it('features titles with banners first and drops adult entries', async () => {
    const src = createAniListSource(async () => aniPage([media(1), media(2, { bannerImage: 'https://img.test/b2.jpg' }), media(3, { isAdult: true }), media(4, { bannerImage: 'https://img.test/b4.jpg' })]), () => NOW);
    const out = await src.list('featured', 1, 12, signal);
    expect(out.items).toHaveLength(3);
    expect(out.items.slice(0, 2).every((item) => ['a2', 'a4'].includes(item.card.id))).toBe(true);
    expect(out.items.some((item) => item.card.id === 'a1')).toBe(true);
    const bannered = out.items[0]!.card.id === 'a2' ? out.items[0]! : out.items[1]!;
    const numericId = bannered.card.id === 'a2' ? 2 : 4;
    expect(bannered.card).toMatchObject({ rating: 8, posterUrl: `https://img.test/${numericId}.jpg`, bannerUrl: `https://img.test/b${numericId}.jpg`, format: 'series', status: 'airing', season: 'fall' });
    expect(bannered.malId).toBe(numericId + 1000);
  });
  it('maps filters and sort for browse', async () => {
    let body: { query: string; variables: Record<string, unknown> } | null = null;
    const src = createAniListSource(async (_u, init) => { body = JSON.parse(String(init?.body)); return aniPage([media(1)]); }, () => NOW);
    await src.browse({ q: 'naruto', sort: 'relevance', format: 'movie', status: 'finished', season: 'fall', year: 2026, genre: 'Action', page: 1, limit: 24 }, signal);
    expect(body!.variables).toMatchObject({ search: 'naruto', format_in: ['MOVIE'], status: 'FINISHED', season: 'FALL', seasonYear: 2026, genre: 'Action', sort: ['SEARCH_MATCH'] });
    await src.browse({ sort: 'relevance', page: 1, limit: 24 }, signal);
    expect(body!.variables.sort).toEqual(['POPULARITY_DESC']);
  });
  it('lists genres without Hentai and looks up by MAL id', async () => {
    let q = '';
    const src = createAniListSource(async (_u, init) => { q = JSON.parse(String(init?.body)).query; return q.includes('GenreCollection') ? json({ data: { GenreCollection: ['Action', 'Hentai', 'Drama'] } }) : json({ data: { Media: media(7) } }); }, () => NOW);
    expect((await src.genres(signal)).map((g) => g.name)).toEqual(['Action', 'Drama']);
    await src.byRef({ kind: 'm', id: 1007 }, signal);
    expect(q).toContain('idMal: $id');
  });
  it('builds related from relations then recommendations, anime only', async () => {
    const src = createAniListSource(async () => json({ data: { Media: { id: 1, relations: { edges: [{ node: { type: 'ANIME', ...media(2) } }, { node: { type: 'MANGA', ...media(3) } }] }, recommendations: { nodes: [{ mediaRecommendation: media(4) }, { mediaRecommendation: media(1) }, { mediaRecommendation: media(5, { isAdult: true }) }] } } } }), () => NOW);
    expect((await src.related({ kind: 'a', id: 1 }, 12, signal)).map((t) => t.card.id)).toEqual(['a2', 'a4']);
  });
  it('maps a missing title to not_found', async () => {
    const src = createAniListSource(async () => json({ data: { Media: null } }), () => NOW);
    await expect(src.byRef({ kind: 'a', id: 9 }, signal)).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('Jikan source', () => {
  it('maps an anime, strips the MAL rewrite tag and rescales nothing', () => {
    expect(mapJikanAnime(jikanAnime(5), NOW)).toMatchObject({ provider: 'jikan', externalId: '5', title: 'Jikan 5', titleNative: 'ジ', synopsis: 'Hello.', format: 'series', status: 'airing', season: 'fall', year: 2026, episodeCount: 24, rating: 7.8, genres: ['Comedy'], posterUrl: 'https://cdn.test/5.jpg', bannerUrl: null });
    expect(() => mapJikanAnime({ title: 'x' }, NOW)).toThrow();
  });
  it('always asks for sfw, drops Rx titles, and clamps the page size to 25', async () => {
    let url = '';
    const src = createJikanSource(async (u) => { url = u; return jikanList([jikanAnime(1), jikanAnime(2, { rating: 'Rx - Hentai' })]); }, { pacer: instant, now: () => NOW });
    const out = await src.list('trending', 2, 50, signal);
    expect(url).toContain('/top/anime');
    expect(url).toContain('filter=bypopularity');
    expect(url).toContain('sfw=true');
    expect(url).toContain('limit=25');
    expect(out).toMatchObject({ total: 99, hasNextPage: true, limit: 25 });
    expect(out.items.map((t) => t.card.id)).toEqual(['m1']);
  });
  it('translates browse filters, resolves genre names to ids, and returns nothing for unsupported filters', async () => {
    const urls: string[] = [];
    const src = createJikanSource(async (u) => { urls.push(u); return u.includes('/genres/') ? json({ data: [{ mal_id: 4, name: 'Comedy', count: 5 }] }) : jikanList([jikanAnime(1)]); }, { pacer: instant, now: () => NOW });
    await src.browse({ q: 'x', sort: 'rating', genre: 'comedy', format: 'movie', status: 'finished', season: 'fall', year: 2026, page: 1, limit: 24 }, signal);
    const u = new URL(urls[urls.length - 1]!);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ q: 'x', genres: '4', type: 'movie', status: 'complete', start_date: '2026-10-01', end_date: '2026-12-31', order_by: 'score', sort: 'desc', sfw: 'true' });
    expect((await src.browse({ sort: 'popularity', status: 'hiatus', page: 1, limit: 24 }, signal)).items).toEqual([]);
    expect((await src.browse({ sort: 'popularity', genre: 'Nope', page: 1, limit: 24 }, signal)).items).toEqual([]);
  });
  it('uses Jikan’s native seasonal archive for season-only browse and maps format filters', async () => {
    let url = '';
    const src = createJikanSource(async (u) => { url = u; return jikanList([jikanAnime(1)]); }, { pacer: instant, now: () => NOW });
    const out = await src.browse({ sort: 'popularity', season: 'winter', year: 2026, format: 'series', page: 2, limit: 24 }, signal);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v4/seasons/2026/winter');
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({ filter: 'tv', sfw: 'true', page: '2', limit: '24' });
    expect(parsed.searchParams.has('start_date')).toBe(false);
    expect(out.items.map((item) => item.card.id)).toEqual(['m1']);
  });
  it('maps provider errors for missing and unavailable catalogue titles', async () => {
    await expect(createJikanSource(async () => json({}, { status: 404 }), { pacer: instant }).byRef({ kind: 'm', id: 1 }, signal)).rejects.toMatchObject({ kind: 'not_found' });
    await expect(createJikanSource(async () => json({}, { status: 504 }), { pacer: instant }).byRef({ kind: 'm', id: 1 }, signal)).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('only supports MyAnimeList ids', () => {
    const src = createJikanSource(async () => json({}), { pacer: instant });
    expect(src.supports({ kind: 'm', id: 1 })).toBe(true);
    expect(src.supports({ kind: 'a', id: 1 })).toBe(false);
    expect(src.supports({ kind: 'h', id: 1 })).toBe(false);
  });
});

describe('Pacer', () => {
  it('spaces starts by the gap', async () => {
    let t = 0; const sleeps: number[] = [];
    const p = new Pacer(400, () => t, async (ms) => { sleeps.push(ms); });
    await p.wait(); await p.wait(); await p.wait();
    expect(sleeps).toEqual([400, 800]);
  });
});

describe('service and handlers', () => {
  it('enriches live catalogue cards with TMDB artwork without changing their Kairo ids', async () => {
    const artworkProvider: ArtworkProvider = {
      id: 'tmdb',
      lookup: async () => ({ tmdbId: 1429, mediaType: 'tv', posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg', bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg' }),
    };
    const d = deps(async (u) => isAni(u) ? aniPage([media(1)]) : json({}), { artworkProvider });
    const response = await call(d, 'featured', req());
    expect(response.body).toMatchObject({
      data: { items: [{ id: 'a1', posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg', bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg' }] },
      meta: { artworkProvider: 'tmdb' },
    });
  });

  it('returns TMDB-only metadata and attribution when the catalogue has gaps', async () => {
    const artworkProvider: ArtworkProvider = {
      id: 'tmdb',
      lookup: async () => ({
        tmdbId: 1429, mediaType: 'tv', posterUrl: null, bannerUrl: null,
        overview: 'A scout fights to protect humanity.', rating: 8.6,
        genres: ['Action', 'Drama'], releaseYear: 2013, episodeCount: 87,
      }),
    };
    const sparseMedia = media(1, {
      description: '', averageScore: null, episodes: null, seasonYear: null,
      startDate: { year: null }, genres: [],
    });
    const d = deps(async (u) => isAni(u) ? json({ data: { Media: sparseMedia } }) : json({}), { artworkProvider });
    const response = await call(d, 'metadata', req({}, { id: 'a1' }));
    expect(response.body).toMatchObject({
      data: {
        synopsis: 'A scout fights to protect humanity.', rating: 8.6,
        genres: ['Action', 'Drama'], episodeCount: 87,
      },
    });
    const payload = response.body as { data?: { sources?: { providerId: string }[]; providers?: { provider: string; state: string }[] } };
    expect(payload.data?.sources?.some((source) => source.providerId === 'tmdb')).toBe(true);
    expect(payload.data?.providers?.some((provider) => provider.provider === 'tmdb' && provider.state === 'ok')).toBe(true);

    const cardResponse = await call(d, 'anime', req({}, { id: 'a1' }));
    expect(cardResponse.body).toMatchObject({
      data: {
        synopsis: 'A scout fights to protect humanity.', rating: 8.6,
        genres: ['Action', 'Drama'], releaseYear: 2013, episodeCount: 87,
      },
    });
  });

  it('serves AniList data with the API envelope and caches it', async () => {
    let calls = 0;
    const d = deps(async (u) => { calls++; return isAni(u) ? aniPage([media(1, { bannerImage: 'https://img.test/b.jpg' })]) : json({}, { status: 500 }); });
    const a = await call(d, 'featured', req());
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ success: true, data: { items: [{ id: 'a1', title: 'Title 1' }] }, meta: { requestId: 'r1', count: 1, source: 'anilist' } });
    await call(d, 'featured', req());
    expect(calls).toBe(1);
  });
  it('falls back to Jikan when AniList returns no search matches and does not wait for TMDB artwork', async () => {
    let tmdbCalls = 0;
    const artworkProvider: ArtworkProvider = { id: 'tmdb', lookup: async () => { tmdbCalls += 1; return null; } };
    const d = deps(async (u) => isAni(u) ? aniPage([]) : jikanList([jikanAnime(3)]), { artworkProvider });
    const response = await call(d, 'search', req({ q: 'Example Anime', sort: 'relevance' }));
    expect(response).toMatchObject({ status: 200, body: { data: { items: [{ id: 'm3' }] }, meta: { source: 'jikan', degraded: true } } });
    expect(tmdbCalls).toBe(0);
  });

  it('resolves legacy HiAnime title ids while AniList remains the primary catalogue', async () => {
    const legacyTitle: LiveTitle = {
      card: {
        id: 'h8', slug: 'attack-on-titan-8-h8', title: 'Attack on Titan', synopsis: 'Humanity fights for survival.',
        posterUrl: null, bannerUrl: null, format: 'series', releaseYear: 2013, season: 'spring',
        status: 'finished', rating: 8.5, episodeCount: 25, genres: ['Action'],
      },
      altTitles: ['Shingeki no Kyojin'], malId: null, anilistId: null,
      url: 'https://hianime.at/watch/attack-on-titan-8', provider: 'hianime',
    };
    const legacySource: CatalogSource = {
      id: 'hianime', displayName: 'HiAnime',
      attribution: { providerId: 'hianime', displayName: 'HiAnime', text: 'HiAnime catalogue.', url: 'https://hianime.at', termsUrl: 'https://hianime.at', license: null, requirements: [] },
      maxLimit: 24, supports: (ref) => ref.kind === 'h',
      list: async (_kind, _page, limit) => ({ items: [], total: 0, hasNextPage: false, limit }),
      browse: async (query) => ({ items: [], total: 0, hasNextPage: false, limit: query.limit }),
      genres: async () => [], byRef: async () => legacyTitle, related: async () => [],
    };
    const base = deps(async () => json({}));
    const d = { ...base, sources: [...base.sources, legacySource] };
    const response = await call(d, 'anime', req({}, { id: 'attack-on-titan-8-h8' }));
    expect(response).toMatchObject({ status: 200, body: { data: { id: 'h8', title: 'Attack on Titan' } } });
  });

  it('does not reuse list cache entries after the configured catalogue providers change', async () => {
    const cache = new MemoryCache();
    let jikanCalls = 0;
    const first = deps(async (u) => isAni(u) ? aniPage([media(1)]) : json({}), { cache });
    await call(first, 'trending', req());
    const onlyJikan = createJikanSource(async () => { jikanCalls += 1; return jikanList([jikanAnime(2)]); }, { pacer: instant, now: () => NOW });
    const second: Deps = { ...first, sources: [onlyJikan] };
    const response = await call(second, 'trending', req());
    expect(response).toMatchObject({ status: 200, body: { data: { items: [{ id: 'm2' }] }, meta: { source: 'jikan' } } });
    expect(jikanCalls).toBe(1);
  });

  it('fails over to Jikan when AniList is rate limited, and marks the response degraded', async () => {
    const d = deps(async (u) => isAni(u) ? json({ errors: [{ status: 429 }] }, { status: 429, headers: { 'Retry-After': '30' } }) : jikanList([jikanAnime(1)]));
    const r = await call(d, 'trending', req({ page: '1', limit: '12' }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ data: { items: [{ id: 'm1' }] }, meta: { source: 'jikan', degraded: true, page: 1, hasNextPage: true, total: 99 } });
  });
  it('serves stale data when every provider fails, and 503 PROVIDER_UNAVAILABLE when there is nothing cached', async () => {
    let down = false; let t = 1_000_000;
    const d = deps(async (u) => (down ? json({}, { status: 503 }) : isAni(u) ? aniPage([media(1)]) : jikanList([])), { now: () => t });
    await call(d, 'trending', req());
    down = true; t += 2 * 3600 * 1000; // past fresh (1h), inside stale (24h)
    const stale = await call(d, 'trending', req());
    expect(stale).toMatchObject({ status: 200, body: { meta: { stale: true, degraded: true } } });
    const none = await call(deps(async () => json({}, { status: 503 })), 'trending', req());
    expect(none).toMatchObject({ status: 503, body: { success: false, error: { code: 'PROVIDER_UNAVAILABLE' } } });
  });
  it('does not fail over on not_found and returns 404', async () => {
    let jikanCalled = false;
    const d = deps(async (u) => { if (!isAni(u)) jikanCalled = true; return json({ data: { Media: null } }); });
    const r = await call(d, 'anime', req({}, { id: 'gone-a99' }));
    expect(r).toMatchObject({ status: 404, body: { error: { code: 'RESOURCE_NOT_FOUND' } } });
    expect(jikanCalled).toBe(false);
  });
  it('rejects client-supplied playback URLs and malformed server ids', async () => {
    const d = deps(async () => json({}));
    const response = await call(d, 'playback', req({ serverId: 'https://evil.example/video.m3u8' }, { id: 'a7', episodeNumber: '1' }));
    expect(response).toMatchObject({ status: 400, body: { success: false, error: { code: 'VALIDATION_ERROR' } } });
  });
  it('validates ids and parameters', async () => {
    const d = deps(async () => json({}));
    expect(await call(d, 'anime', req({}, { id: 'bad id!' }))).toMatchObject({ status: 400 });
    expect(await call(d, 'anime', req({}, { id: 'nothing' }))).toMatchObject({ status: 404 });
    expect(await call(d, 'search', req({ q: 'a' }))).toMatchObject({ status: 400 });
    expect(await call(d, 'trending', req({ limit: '999' }))).toMatchObject({ status: 400 });
    expect(await call(d, 'browse', req({ sort: 'nope' }))).toMatchObject({ status: 400 });
  });
  it('returns details with altTitles, and unified metadata with the source attribution', async () => {
    const d = deps(async () => json({ data: { Media: media(7, { synonyms: ['Seven'], title: { romaji: 'Nana', english: 'Seven Stars', native: 'ナナ' } }) } }));
    const a = await call(d, 'anime', req({}, { id: 'seven-stars-a7' }));
    expect(a.body).toMatchObject({ data: { id: 'a7', title: 'Seven Stars', altTitles: ['Nana', 'ナナ', 'Seven'] } });
    const m = await call(d, 'metadata', req({}, { id: 'a7' }));
    expect(m.body).toMatchObject({ data: { title: 'Seven Stars', ids: { anilist: '7', mal: '1007' }, sources: [{ providerId: 'anilist', displayName: 'AniList' }], providers: [{ provider: 'anilist', state: 'cached' }] } });
  });
  it('gets episodes through the MyAnimeList id of an AniList title', async () => {
    const urls: string[] = [];
    const d = deps(async (u) => { urls.push(u); return isAni(u) ? json({ data: { Media: media(7) } }) : json({ data: [{ mal_id: 1, title: 'One' }, { mal_id: 2, title: 'Two' }], pagination: { has_next_page: true } }); });
    const r = await call(d, 'episodes', req({ page: '2', limit: '50' }, { id: 'a7' }));
    expect(urls.some((u) => u.includes('/anime/1007/episodes?page=2'))).toBe(true);
    expect(r.body).toMatchObject({ data: { items: [{ id: 'a7-e1', episodeNumber: 1, title: 'One' }, { episodeNumber: 2 }] }, meta: { page: 2, hasNextPage: true, source: 'jikan' } });
  });
  it('returns TMDB episode stills on the live episode route when artwork enrichment is enabled', async () => {
    const episodeProvider = {
      id: 'test-episodes', displayName: 'Test episodes', termsVerified: true,
      listEpisodes: async () => ({ items: [{ episodeNumber: 1, title: 'The First Mission', airedAt: null, synopsis: '', durationSeconds: null }], hasNextPage: false, total: 1 }),
    };
    const artworkProvider: ArtworkProvider = {
      id: 'tmdb',
      lookup: async () => ({ tmdbId: 1429, mediaType: 'tv', posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg', bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg' }),
      episodeStills: async () => ({ 1: 'https://image.tmdb.org/t/p/w780/episode-1.jpg' }),
    };
    const d = deps(async () => json({ data: { Media: media(7) } }), { episodeProviders: [episodeProvider], artworkProvider });
    const response = await call(d, 'episodes', req({ page: '1' }, { id: 'a7' }));
    expect(response.body).toMatchObject({ data: { items: [{ id: 'a7-e1', episodeNumber: 1, thumbnailUrl: 'https://image.tmdb.org/t/p/w780/episode-1.jpg' }] } });
  });

  it('lists providers and reports ready without calling them', async () => {
    let calls = 0;
    const d = deps(async () => { calls++; return json({}); });
    expect(await call(d, 'providers', req())).toMatchObject({ body: { data: { items: [{ id: 'anilist', priority: 1, capabilities: { episodes: false } }, { id: 'jikan', priority: 2, capabilities: { episodes: false } }], episodeProviders: [{ id: 'jikan', priority: 1, termsVerified: false, capabilities: { episodes: true } }] } } });
    expect(await call(d, 'ready', req())).toMatchObject({ body: { data: { status: 'ready', providers: ['anilist', 'jikan'], episodeProviders: ['jikan'] } } });
    expect(calls).toBe(0);
  });
});

describe('browse parsing', () => {
  it('resolves season=current and defaults sort to popularity', () => {
    expect(currentSeason(new Date('2026-11-07T00:00:00Z'))).toEqual({ season: 'fall', year: 2026 });
    expect(currentSeason(new Date('2026-01-01T00:00:00Z'))).toEqual({ season: 'winter', year: 2026 });
    const r = parseBrowse({ season: 'current' }, new Date('2026-11-07T00:00:00Z'));
    expect(r).toMatchObject({ ok: true, value: { season: 'fall', year: 2026, sort: 'popularity', page: 1, limit: 24 } });
    expect(parseBrowse({ format: 'tv' }, new Date())).toMatchObject({ ok: false });
  });
});
