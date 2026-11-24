// FIXTURES BELOW ARE HAND-WRITTEN from each provider's documented response shape. They are NOT captured live responses.
// Run the first live check in docs/LIVE_CATALOGUE.md before trusting the adapters.
import { describe, it, expect } from 'vitest';
import { MemoryCache } from '../metadata/cache';
import type { ArtworkProvider } from '../artwork/tmdb';
import { CircuitBreaker } from '../metadata/breaker';
import { createAniListSource, buildPageQuery } from './anilist';
import { createJikanEpisodeProvider } from '../episodes/providers/jikan';
import { createLiveHandlers, parseBrowse, currentSeason } from './handlers';
import { makeSlug, parseRef, slugify } from './ids';
import type { Deps } from './service';
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

function deps(handler: (url: string, init?: RequestInit) => Promise<Response>, over: Partial<Deps> = {}): Deps {
  const f = (url: string, init?: RequestInit) => handler(url, init);
  return {
    sources: [createAniListSource(f, () => NOW)],
    episodeProviders: [createJikanEpisodeProvider(f, async () => {})], unknownEpisodeProviders: [],
    cache: new MemoryCache(), breaker: new CircuitBreaker(), now: Date.now, ...over,
  };
}
const req = (query: Record<string, string> = {}, params: Record<string, string> = {}, env: LiveRequest['env'] = {}): LiveRequest => ({ query, param: (n) => params[n], requestId: 'r1', env });
const call = (d: Deps, name: keyof ReturnType<typeof createLiveHandlers>, r: LiveRequest) => createLiveHandlers(async () => json({}), () => d)[name](r);
const isAni = (url: string) => url === 'https://graphql.anilist.co';

describe('provider configuration', () => {
  it('exposes AniList as the only catalogue provider and keeps episode discovery separate', async () => {
    const response = await call(deps(async () => json({})), 'providers', req());
    expect(response.body).toMatchObject({
      data: {
        items: [{ id: 'anilist', displayName: 'AniList', priority: 1 }],
        episodeProviders: [{ id: 'jikan', displayName: 'Jikan episode catalogue', priority: 1 }],
      },
    });
  });
});

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
    const src = createAniListSource(async () => aniPage([media(1), media(2, { bannerImage: 'https://img.test/b2.jpg' }), media(3, { isAdult: true }), media(4, { bannerImage: 'https://img.test/b4.jpg' }), media(5, { countryOfOrigin: 'CN' })]), () => NOW);
    const out = await src.list('featured', 1, 12, signal);
    expect(out.items).toHaveLength(4);
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
  it('uses AniList-native seasonal trending and genre discovery queries', async () => {
    const requests: { query: string; variables: Record<string, unknown> }[] = [];
    const src = createAniListSource(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
      requests.push(request);
      return request.query.includes('GenreCollection')
        ? json({ data: { GenreCollection: ['Action', 'Drama'] } })
        : aniPage([media(88)]);
    }, () => NOW);

    await src.browse({ sort: 'trending', season: 'fall', year: 2026, page: 1, limit: 24 }, signal);
    expect(requests[0]?.variables).toMatchObject({
      season: 'FALL', seasonYear: 2026, sort: ['TRENDING_DESC'],
    });
    expect(requests[0]?.query).toContain('season: $season');
    expect(requests[0]?.query).toContain('seasonYear: $seasonYear');

    expect((await src.genres(signal)).map((item) => item.name)).toEqual(['Action', 'Drama']);
    expect(requests[1]?.query).toContain('GenreCollection');

    await src.browse({ sort: 'popularity', genre: 'Adventure', page: 1, limit: 12 }, signal);
    expect(requests[2]?.variables).toMatchObject({
      genre: 'Adventure', sort: ['POPULARITY_DESC'],
    });
  });
  it('lists genres without Hentai and resolves legacy MAL-ID aliases through AniList', async () => {
    let q = '';
    const src = createAniListSource(async (_u, init) => { q = JSON.parse(String(init?.body)).query; return q.includes('GenreCollection') ? json({ data: { GenreCollection: ['Action', 'Hentai', 'Drama'] } }) : json({ data: { Media: media(7) } }); }, () => NOW);
    expect((await src.genres(signal)).map((g) => g.name)).toEqual(['Action', 'Drama']);
    await src.byRef({ kind: 'm', id: 1007 }, signal);
    expect(q).toContain('idMal: $id');
    expect(q).not.toContain('countryOfOrigin:');
  });
  it('accepts non-Japanese AniList anime entries in browse and direct title resolution', async () => {
    const source = createAniListSource(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { query: string };
      if (request.query.includes('Page(')) return aniPage([media(10), media(11, { countryOfOrigin: 'CN' })]);
      return json({ data: { Media: media(12, { countryOfOrigin: 'CN' }) } });
    }, () => NOW);
    const page = await source.browse({ sort: 'popularity', page: 1, limit: 24 }, signal);
    expect(page.items.map((item) => item.card.id)).toEqual(['a10', 'a11']);
    await expect(source.byRef({ kind: 'a', id: 12 }, signal)).resolves.toMatchObject({ card: { id: 'a12' } });
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
  it('keeps empty AniList seasonal and discovery results as authoritative responses', async () => {
    let aniListCalls = 0;
    const d = deps(async () => {
      aniListCalls += 1;
      return aniPage([]);
    });
    const seasonal = await call(d, 'browse', req({ season: 'fall', year: '2026', sort: 'popularity', page: '1', limit: '24' }));
    const discovery = await call(d, 'browse', req({ genre: 'Action', sort: 'popularity', page: '1', limit: '12' }));

    expect(seasonal).toMatchObject({
      status: 200,
      body: { data: { items: [] }, meta: { source: 'anilist' } },
    });
    expect(discovery).toMatchObject({
      status: 200,
      body: { data: { items: [] }, meta: { source: 'anilist' } },
    });
    expect(aniListCalls).toBe(2);
  });

  it('serves stale AniList data during a temporary provider failure, and 503 when nothing is cached', async () => {
    let down = false; let t = 1_000_000;
    const d = deps(async () => (down ? json({}, { status: 503 }) : aniPage([media(1)])), { now: () => t });
    await call(d, 'trending', req());
    down = true; t += 2 * 3600 * 1000; // past fresh (1h), inside stale (24h)
    const stale = await call(d, 'trending', req());
    expect(stale).toMatchObject({ status: 200, body: { meta: { stale: true, degraded: true } } });
    const none = await call(deps(async () => json({}, { status: 503 })), 'trending', req());
    expect(none).toMatchObject({ status: 503, body: { success: false, error: { code: 'PROVIDER_UNAVAILABLE' } } });
  });
  it('returns 404 for an AniList title that is not found', async () => {
    let calls = 0;
    const d = deps(async () => { calls += 1; return json({ data: { Media: null } }); });
    const r = await call(d, 'anime', req({}, { id: 'gone-a99' }));
    expect(r).toMatchObject({ status: 404, body: { error: { code: 'RESOURCE_NOT_FOUND' } } });
    expect(calls).toBe(1);
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
    expect(m.body).toMatchObject({ data: { title: 'Seven Stars', ids: { anilist: '7' }, sources: [{ providerId: 'anilist', displayName: 'AniList' }], providers: [{ provider: 'anilist', state: 'cached' }] } });
  });
  it('gets episodes through the MyAnimeList id of an AniList title', async () => {
    const urls: string[] = [];
    const d = deps(async (u) => { urls.push(u); return isAni(u) ? json({ data: { Media: media(7) } }) : json({ data: [{ mal_id: 1, title: 'One' }, { mal_id: 2, title: 'Two' }], pagination: { has_next_page: true } }); });
    const r = await call(d, 'episodes', req({ page: '2', limit: '50' }, { id: 'a7' }));
    expect(urls.some((u) => u.includes('/anime/1007/episodes?page=2'))).toBe(true);
    expect(r.body).toMatchObject({ data: { items: [{ id: 'a7-e1', episodeNumber: 1, title: 'One' }, { episodeNumber: 2 }] }, meta: { page: 2, hasNextPage: true, source: 'jikan' } });
  });
  it('enriches seasonal browse cards with missing TMDB metadata and artwork', async () => {
    const artworkProvider: ArtworkProvider = {
      id: 'tmdb',
      lookup: async () => ({
        tmdbId: 1429, mediaType: 'tv',
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
        overview: 'A seasonal story.',
        rating: 8.1, genres: ['Fantasy'], releaseYear: 2026, episodeCount: 12,
      }),
    };
    const d = deps(async () => aniPage([media(77, {
      description: '', episodes: null, averageScore: null, genres: [],
      coverImage: { extraLarge: null, large: null }, startDate: { year: null },
    })]), { artworkProvider });
    const response = await call(d, 'browse', req({ season: 'fall', year: '2026', sort: 'popularity' }));
    expect(response.body).toMatchObject({
      data: { items: [{
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
        synopsis: 'A seasonal story.', rating: 8.1, genres: ['Fantasy'],
        releaseYear: 2026, episodeCount: 12,
      }] },
    });
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

  it('lists providers and reports readiness only when D1 and the complete schema are available', async () => {
    let calls = 0;
    const d = deps(async () => { calls++; return json({}); });
    expect(await call(d, 'providers', req())).toMatchObject({ body: { data: { items: [{ id: 'anilist', priority: 1, capabilities: { episodes: false } }], episodeProviders: [{ id: 'jikan', priority: 1, termsVerified: false, capabilities: { episodes: true } }] } } });

    const schemaTables = [
      'anime', 'episodes', 'user_profiles', 'user_preferences', 'user_library',
      'watch_progress', 'viewing_history', 'data_sources', 'anime_provider_ids',
      'anime_relations', 'anime_field_sources', 'auth_identities', 'password_credentials',
      'sessions', 'email_verification_tokens', 'password_reset_tokens', 'provider_connections',
      'auth_rate_limits', 'google_oauth_states', 'user_credentials', 'user_watch_history', 'user_watch_history_tombstones',
      'user_watch_history_clear_markers', 'user_movie_library_refs', 'user_media_playback',
      'movies', 'movie_external_ids', 'movie_genres', 'movie_genre_links', 'movie_credits',
      'movie_availability_offers', 'user_movie_library',
      'youtube_oauth_states', 'youtube_feed_channels', 'youtube_feed_cursors',
      'youtube_watch_history', 'youtube_watch_later', 'admin_console_access',
      'app_security_state', 'admin_login_security',
    ];
    const makeReadyDb = (options: {
      missingTable?: string;
      missingProfileColumns?: boolean;
      missingSessionColumns?: boolean;
      missingCredentialColumns?: boolean;
      missingYouTubeColumn?: boolean;
      missingPlaybackColumns?: boolean;
      missingSecurityState?: boolean;
    } = {}) => ({
      prepare: (sql: string) => ({
        first: async () => sql.includes('FROM app_security_state') && options.missingSecurityState ? null : { ok: 1 },
        all: async () => {
          if (sql.includes("FROM sqlite_master")) {
            return { results: schemaTables.filter((name) => name !== options.missingTable).map((name) => ({ name })) };
          }
          if (sql.includes("FROM user_profiles") && options.missingProfileColumns) throw new Error('username/access_email column missing');
          if (sql.includes("FROM sessions") && options.missingSessionColumns) throw new Error('sessions column missing');
          if (sql.includes("FROM user_credentials") && options.missingCredentialColumns) throw new Error('user_credentials column missing');
          if (sql.includes("FROM youtube_feed_channels") && options.missingYouTubeColumn) throw new Error('upload_playlist_id column missing');
          if (sql.includes("FROM user_media_playback") && options.missingPlaybackColumns) throw new Error('session_id/sequence columns missing');
          return { results: [] };
        },
      }),
    });
    const readyDb = makeReadyDb() as unknown as NonNullable<LiveRequest['env']['DB']>;
    expect(await call(d, 'ready', req({}, {}, { DB: readyDb }))).toMatchObject({
      status: 200,
      body: { data: { status: 'ready', database: 'ok', schema: 'ok', providers: ['anilist'], episodeProviders: ['jikan'] } },
    });

    const incompleteDb = makeReadyDb({ missingTable: 'admin_login_security' }) as unknown as NonNullable<LiveRequest['env']['DB']>;
    expect(await call(d, 'ready', req({}, {}, { DB: incompleteDb }))).toMatchObject({
      status: 503,
      body: { success: false, error: { code: 'DATABASE_SCHEMA_NOT_READY' } },
    });
    expect(await call(d, 'ready', req({}, {}, { DB: makeReadyDb({ missingProfileColumns: true }) as unknown as NonNullable<LiveRequest['env']['DB']> }))).toMatchObject({ status: 503 });
    expect(await call(d, 'ready', req({}, {}, { DB: makeReadyDb({ missingSessionColumns: true }) as unknown as NonNullable<LiveRequest['env']['DB']> }))).toMatchObject({ status: 503 });
    expect(await call(d, 'ready', req({}, {}, { DB: makeReadyDb({ missingCredentialColumns: true }) as unknown as NonNullable<LiveRequest['env']['DB']> }))).toMatchObject({ status: 503 });
    expect(await call(d, 'ready', req({}, {}, { DB: makeReadyDb({ missingYouTubeColumn: true }) as unknown as NonNullable<LiveRequest['env']['DB']> }))).toMatchObject({ status: 503 });
    expect(await call(d, 'ready', req({}, {}, { DB: makeReadyDb({ missingPlaybackColumns: true }) as unknown as NonNullable<LiveRequest['env']['DB']> }))).toMatchObject({ status: 503 });
    expect(await call(d, 'ready', req({}, {}, { DB: makeReadyDb({ missingSecurityState: true }) as unknown as NonNullable<LiveRequest['env']['DB']> }))).toMatchObject({ status: 503 });
    expect(await call(d, 'ready', req())).toMatchObject({ status: 503 });
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
