/// <reference types="@cloudflare/workers-types" />
import { Hono, type Context, type Next } from 'hono';
import { Innertube } from 'youtubei.js';
import { cors } from 'hono/cors';
import { boundedInt, parseId, parsePagination, parseSearchParams } from './lib/validation';
import { clearSessionCookie, findSessionUser, revokeSession } from './auth/session';
import { registerAuthRoutes } from './auth/routes';
import { registerYouTubeMediaRoutes } from './youtube/routes';
import { GENRES_SQL, buildListQuery, buildRelatedQuery, buildSearchQuery } from './repositories/catalog';
import { BASE_RECORD_SQL, INSERT_PROVIDER_ID_SQL, PROVIDER_IDS_SQL } from './repositories/providerIds';
import { buildRegistry, createCache, resolveUnified, sharedBreaker, toBaseRecord, type BaseRow } from './metadata/service';
import { createLiveHandlers, isLiveMode, type LiveHandlers } from './live/handlers';
import type { LiveRequest, LiveResult } from './live/types';
import { createTmdbMovieProvider } from './movies/providers/tmdb';
import { createMovieCatalogService } from './movies/service';
import { createTmdbExperienceService, type TmdbFeedKind, type TmdbMediaType, type TmdbSearchType } from './movies/experience';
import { movieIdentity, persistMovieDetail, persistMovieSummary, searchStoredMovies } from './movies/repository';
import type { MovieDiscoverQuery, MovieListKind } from './movies/types';
import { ProviderError } from './metadata/types';

interface Bindings {
  DB: D1Database;
  APP_ENV?: string;
  APP_BASE_URL?: string;
  RESEND_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Base64url-encoded 32-byte AES-GCM key used only for YouTube OAuth token encryption. */
  YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;
  /** Server-only Google API key for public YouTube Data API reads. */
  YOUTUBE_DATA_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  ALLOWED_ORIGIN?: string;
  /** Comma-separated metadata provider ids to enable, e.g. "anilist". Empty = none. */
  METADATA_PROVIDERS?: string;
  /** Optional Workers KV namespace used as the provider-response cache (recommended on workers.dev). */
  METADATA_CACHE?: KVNamespace;
  /** "live" (default): serve the public catalogue from live providers; account, library and history routes still use D1. "db": use the original D1 catalogue routes. */
  CATALOG_SOURCE?: string;
  /** Catalogue-provider priority, comma-separated. */
  LIVE_PROVIDERS?: string;
  /** Independent episode-provider priority, e.g. "hianime,jikan". */
  EPISODE_PROVIDERS?: string;
  /** HiAnime mirror base URL; adapter enforces a fixed HTTPS host allowlist. */
  HIANIME_BASE_URL?: string;
  /** Opt-in to ZokoAnime's documented iframe route; disabled unless explicitly set to true. */
  ZOKOANIME_EMBED_ENABLED?: string;
  /** TMDB API Read Access Token stored as a Cloudflare Worker secret. */
  TMDB_ACCESS_TOKEN?: string;
  /** Staging-only bearer secret for the experimental YouTube cookie-feed endpoint. */
  YOUTUBE_STAGING_TOKEN?: string;
  /** Enable TMDB-powered Movies discovery/search only after credentials and provider terms are approved. */
  MOVIES_TMDB_ENABLED?: string;
  /** Explicit owner approval for the provider's applicable licence, caching, and attribution terms. */
  MOVIES_TMDB_TERMS_APPROVED?: string;
  /** Enable admin-only incremental D1 ingestion. Requires MOVIES_TMDB_TERMS_APPROVED=true. */
  MOVIES_INGESTION_ENABLED?: string;
}

type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('/api/*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  await next();
});

app.use('/api/*', async (c, next) => {
  const origin = c.env.ALLOWED_ORIGIN;
  if (origin) {
    return cors({ origin, allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'], credentials: true })(c, next);
  }
  await next();
});

function ok<T>(c: Context<{ Bindings: Bindings; Variables: Variables }>, data: T, meta: Record<string, unknown> = {}) {
  return c.json({ success: true, data, meta: { requestId: c.get('requestId'), ...meta } });
}

function fail(c: Context<{ Bindings: Bindings; Variables: Variables }>, status: 400 | 401 | 403 | 404 | 429 | 500 | 503, code: string, message: string) {
  return c.json({ success: false, error: { code, message }, meta: { requestId: c.get('requestId') } }, status);
}

registerAuthRoutes(app);
registerYouTubeMediaRoutes(app);

function moviesProviderEnabled(c: AppContext): boolean {
  return c.env.MOVIES_TMDB_ENABLED === 'true' && c.env.MOVIES_TMDB_TERMS_APPROVED === 'true';
}

function movieCatalog(c: AppContext) {
  const provider = createTmdbMovieProvider(fetch, c.env.TMDB_ACCESS_TOKEN);
  return createMovieCatalogService(provider, createCache(c.env));
}

function movieExperience(c: AppContext) {
  return createTmdbExperienceService(fetch, c.env.TMDB_ACCESS_TOKEN, createCache(c.env));
}

function movieProviderFailure(c: AppContext, error: unknown) {
  if (error instanceof ProviderError) {
    if (error.kind === 'not_found') return fail(c, 404, 'MOVIE_NOT_FOUND', 'The requested movie was not found.');
    if (error.kind === 'rate_limited') {
      c.header('Retry-After', String(error.retryAfterSeconds ?? 60));
      return fail(c, 429, 'MOVIE_PROVIDER_RATE_LIMITED', 'The movie metadata provider is rate limiting requests.');
    }
    if (error.kind === 'invalid_response') return fail(c, 503, 'MOVIE_PROVIDER_INVALID_RESPONSE', 'The movie metadata provider returned an unexpected response.');
  }
  logError(c, 'movies_provider_failed', error);
  return fail(c, 503, 'MOVIES_UNAVAILABLE', 'Movie discovery is temporarily unavailable.');
}

const MOVIE_LIST_KINDS: MovieListKind[] = [
  'trending_day', 'trending_week', 'popular', 'top_rated', 'upcoming', 'now_playing',
];

app.get('/api/v1/movies/discover', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const kindRaw = c.req.query('kind') ?? 'trending_week';
  if (!MOVIE_LIST_KINDS.includes(kindRaw as MovieListKind)) return fail(c, 400, 'VALIDATION_ERROR', 'kind must be trending_day, trending_week, popular, top_rated, upcoming, or now_playing.');
  const page = boundedInt(c.req.query('page'), 1, 1, 500);
  const yearRaw = c.req.query('year');
  let year: number | undefined;
  if (yearRaw !== undefined) {
    const parsedYear = boundedInt(yearRaw, 2000, 1800, 2200);
    if (parsedYear === null) return fail(c, 400, 'VALIDATION_ERROR', 'year must be 1800–2200.');
    year = parsedYear;
  }
  if (page === null) return fail(c, 400, 'VALIDATION_ERROR', 'page must be 1–500.');
  const genreIds = (c.req.query('genres') ?? '').split(',').map((value) => value.trim()).filter((value) => /^\d{1,8}$/.test(value)).slice(0, 10);
  const language = c.req.query('language');
  if (language && !/^[a-z]{2,3}$/.test(language)) return fail(c, 400, 'VALIDATION_ERROR', 'language must be a 2–3 character ISO language code.');
  const query: MovieDiscoverQuery = {
    kind: kindRaw as MovieListKind,
    page,
    ...(year === undefined ? {} : { year }),
    ...(genreIds.length ? { genreIds } : {}),
    ...(language ? { originalLanguage: language } : {}),
    includeAdult: c.req.query('include_adult') === 'true',
  };
  try {
    const result = await movieCatalog(c).discover(query);
    return ok(c, result.data, { provider: 'tmdb', cache: result.cache, globalCatalogue: true });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/search', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 1 || q.length > 120) return fail(c, 400, 'VALIDATION_ERROR', 'q must contain 1–120 characters.');
  const page = boundedInt(c.req.query('page'), 1, 1, 500);
  const yearRaw = c.req.query('year');
  let year: number | undefined;
  if (yearRaw !== undefined) {
    const parsedYear = boundedInt(yearRaw, 2000, 1800, 2200);
    if (parsedYear === null) return fail(c, 400, 'VALIDATION_ERROR', 'year must be 1800–2200.');
    year = parsedYear;
  }
  const language = c.req.query('language');
  if (page === null) return fail(c, 400, 'VALIDATION_ERROR', 'page must be 1–500.');
  if (language && !/^[a-z]{2}-[A-Z]{2}$/.test(language)) return fail(c, 400, 'VALIDATION_ERROR', 'language must use the format en-US.');
  try {
    const result = await movieCatalog(c).search({
      query: q,
      page,
      ...(year === undefined ? {} : { year }),
      ...(language ? { language } : {}),
      includeAdult: c.req.query('include_adult') === 'true',
    });
    return ok(c, result.data, { provider: 'tmdb', cache: result.cache, globalCatalogue: true });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/genres', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const language = c.req.query('language') ?? 'en-US';
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(language)) return fail(c, 400, 'VALIDATION_ERROR', 'language must use the format en-US.');
  try {
    const result = await movieCatalog(c).genres(language);
    return ok(c, { items: result.data }, { provider: 'tmdb', cache: result.cache });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

const EXPERIENCE_FEED_KINDS: TmdbFeedKind[] = ['trending', 'popular', 'top_rated', 'now_playing', 'upcoming', 'airing_today', 'on_the_air', 'discover'];

app.get('/api/v1/movies/experience/feed', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const kind = (c.req.query('kind') ?? 'trending') as TmdbFeedKind;
  const mediaType = (c.req.query('media_type') ?? 'movie') as TmdbMediaType;
  const windowRaw = c.req.query('window') ?? 'week';
  const page = boundedInt(c.req.query('page'), 1, 1, 500);
  if (!EXPERIENCE_FEED_KINDS.includes(kind)) return fail(c, 400, 'VALIDATION_ERROR', 'Invalid feed kind.');
  if (!['movie', 'tv', 'all'].includes(mediaType)) return fail(c, 400, 'VALIDATION_ERROR', 'media_type must be movie, tv, or all.');
  if (windowRaw !== 'day' && windowRaw !== 'week') return fail(c, 400, 'VALIDATION_ERROR', 'window must be day or week.');
  if (page === null) return fail(c, 400, 'VALIDATION_ERROR', 'page must be 1–500.');
  const genreIds = (c.req.query('genres') ?? '').split(',').map((v) => v.trim()).filter((v) => /^\d{1,8}$/.test(v)).slice(0, 10);
  const yearRaw = c.req.query('year');
  let year: number | undefined;
  if (yearRaw !== undefined) {
    const parsed = boundedInt(yearRaw, 2000, 1800, 2200);
    if (parsed === null) return fail(c, 400, 'VALIDATION_ERROR', 'year must be 1800–2200.');
    year = parsed;
  }
  try {
    const data = await movieExperience(c).feed({
      kind, mediaType, page, window: windowRaw,
      ...(genreIds.length ? { genreIds } : {}),
      ...(c.req.query('sort_by') ? { sortBy: c.req.query('sort_by')! } : {}),
      ...(year === undefined ? {} : { year }),
      includeAdult: c.req.query('include_adult') === 'true',
    });
    return ok(c, data, { provider: 'tmdb', catalogue: 'global', mediaType });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/experience/search', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const q = (c.req.query('q') ?? '').trim();
  const mediaType = (c.req.query('media_type') ?? 'multi') as TmdbSearchType;
  const page = boundedInt(c.req.query('page'), 1, 1, 500);
  if (!q || q.length > 120) return fail(c, 400, 'VALIDATION_ERROR', 'q must contain 1–120 characters.');
  if (!['movie', 'tv', 'multi'].includes(mediaType)) return fail(c, 400, 'VALIDATION_ERROR', 'media_type must be movie, tv, or multi.');
  if (page === null) return fail(c, 400, 'VALIDATION_ERROR', 'page must be 1–500.');
  try {
    const data = await movieExperience(c).search({ query: q, mediaType, page, includeAdult: c.req.query('include_adult') === 'true' });
    return ok(c, data, { provider: 'tmdb', catalogue: 'global', mediaType });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/experience/genres', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const mediaType = c.req.query('media_type') ?? 'movie';
  const language = c.req.query('language') ?? 'en-US';
  if (mediaType !== 'movie' && mediaType !== 'tv') return fail(c, 400, 'VALIDATION_ERROR', 'media_type must be movie or tv.');
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(language)) return fail(c, 400, 'VALIDATION_ERROR', 'language must use the format en-US.');
  try {
    return ok(c, await movieExperience(c).genres(mediaType, language), { provider: 'tmdb', mediaType });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/experience/people/popular', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const page = boundedInt(c.req.query('page'), 1, 1, 100);
  if (page === null) return fail(c, 400, 'VALIDATION_ERROR', 'page must be 1–100.');
  try {
    return ok(c, await movieExperience(c).popularPeople(page), { provider: 'tmdb', catalogue: 'people' });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/experience/detail/:mediaType/:externalId', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const mediaType = c.req.param('mediaType');
  if (mediaType !== 'movie' && mediaType !== 'tv') return fail(c, 400, 'VALIDATION_ERROR', 'mediaType must be movie or tv.');
  try {
    return ok(c, await movieExperience(c).detail(mediaType, c.req.param('externalId')), { provider: 'tmdb', mediaType });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/experience/:mediaType/:externalId/videos', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const mediaType = c.req.param('mediaType');
  if (mediaType !== 'movie' && mediaType !== 'tv') return fail(c, 400, 'VALIDATION_ERROR', 'mediaType must be movie or tv.');
  try {
    return ok(c, await movieExperience(c).videos(mediaType, c.req.param('externalId')), { provider: 'tmdb', mediaType });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/experience/:mediaType/:externalId/images', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const mediaType = c.req.param('mediaType');
  if (mediaType !== 'movie' && mediaType !== 'tv') return fail(c, 400, 'VALIDATION_ERROR', 'mediaType must be movie or tv.');
  try {
    return ok(c, await movieExperience(c).images(mediaType, c.req.param('externalId')), { provider: 'tmdb', mediaType });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/experience/tv/:tvId/seasons', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  try {
    const data = await movieExperience(c).seasons(c.req.param('tvId'));
    return ok(c, data, { provider: 'tmdb', mediaType: 'tv' });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/experience/tv/:tvId/seasons/:seasonNumber', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const seasonNumber = boundedInt(c.req.param('seasonNumber'), 0, 0, 500);
  if (seasonNumber === null) return fail(c, 400, 'VALIDATION_ERROR', 'seasonNumber must be 0–500.');
  try {
    return ok(c, await movieExperience(c).episodes(c.req.param('tvId'), seasonNumber), { provider: 'tmdb', mediaType: 'tv' });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

/** Search only the movies already ingested into D1; this route never contacts a metadata provider. */
app.get('/api/v1/movies/catalogue/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 1 || q.length > 100) return fail(c, 400, 'VALIDATION_ERROR', 'q must contain 1–100 characters.');
  const page = boundedInt(c.req.query('page'), 1, 1, 500);
  const limit = boundedInt(c.req.query('limit'), 20, 1, 50);
  if (page === null || limit === null) return fail(c, 400, 'VALIDATION_ERROR', 'page must be 1–500 and limit must be 1–50.');
  try {
    const result = await searchStoredMovies(c.env.DB, q, page, limit);
    return ok(c, result, { source: 'd1', globalCatalogue: true });
  } catch (error) {
    logError(c, 'movies_catalogue_search_failed', error);
    return fail(c, 503, 'MOVIES_UNAVAILABLE', 'The stored movie catalogue is temporarily unavailable.');
  }
});

/** Bounded, admin-only, one-page-at-a-time ingestion. No provider-wide scraping job is exposed. */
app.post('/api/v1/movies/ingest', async (c) => {
  if (c.env.MOVIES_INGESTION_ENABLED !== 'true' || !moviesProviderEnabled(c)) {
    return fail(c, 503, 'MOVIES_INGESTION_DISABLED', 'Movie ingestion is disabled until the metadata provider terms and persistence rules are approved.');
  }
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to continue.');
  if (user.role !== 'admin') return fail(c, 403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(c, 400, 'VALIDATION_ERROR', 'A JSON request body is required.');
  const record = body as Record<string, unknown>;
  const kind = record.kind === undefined ? 'popular' : record.kind;
  if (typeof kind !== 'string' || !MOVIE_LIST_KINDS.includes(kind as MovieListKind)) return fail(c, 400, 'VALIDATION_ERROR', 'Invalid movie list kind.');
  const pageRaw = record.page === undefined ? '1' : String(record.page);
  const page = boundedInt(pageRaw, 1, 1, 10);
  if (page === null) return fail(c, 400, 'VALIDATION_ERROR', 'Ingestion page must be 1–10 per request.');
  const year = typeof record.year === 'number' && Number.isInteger(record.year) && record.year >= 1800 && record.year <= 2200 ? record.year : undefined;
  const genreIds = Array.isArray(record.genreIds) ? record.genreIds.filter((v): v is string => typeof v === 'string' && /^\d{1,8}$/.test(v)).slice(0, 10) : [];
  const language = typeof record.originalLanguage === 'string' && /^[a-z]{2,3}$/.test(record.originalLanguage) ? record.originalLanguage : undefined;
  try {
    const result = await movieCatalog(c).discover({
      kind: kind as MovieListKind,
      page,
      ...(year === undefined ? {} : { year }),
      ...(genreIds.length ? { genreIds } : {}),
      ...(language ? { originalLanguage: language } : {}),
      includeAdult: record.includeAdult === true,
    });
    const fetchedAt = new Date().toISOString();
    let stored = 0;
    for (const movie of result.data.items) {
      await persistMovieSummary(c.env.DB, movie, fetchedAt);
      stored += 1;
    }
    return ok(c, { stored, page, kind, provider: 'tmdb' }, { cache: result.cache, boundedIngestion: true });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.post('/api/v1/movies/ingest/:externalId', async (c) => {
  if (c.env.MOVIES_INGESTION_ENABLED !== 'true' || !moviesProviderEnabled(c)) {
    return fail(c, 503, 'MOVIES_INGESTION_DISABLED', 'Movie ingestion is disabled until the metadata provider terms and persistence rules are approved.');
  }
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to continue.');
  if (user.role !== 'admin') return fail(c, 403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  const externalId = c.req.param('externalId');
  try {
    const result = await movieCatalog(c).byId(externalId);
    const movieId = await persistMovieDetail(c.env.DB, result.data, new Date().toISOString());
    return ok(c, { id: movieId, slug: movieIdentity(result.data.providerId, result.data.externalId).slug, provider: 'tmdb' }, { cache: result.cache });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/v1/movies/:externalId', async (c) => {
  if (!moviesProviderEnabled(c)) return fail(c, 503, 'MOVIES_DISABLED', 'Movies metadata is not enabled or its provider terms have not been approved.');
  const externalId = c.req.param('externalId');
  try {
    const result = await movieCatalog(c).byId(externalId);
    return ok(c, result.data, { provider: 'tmdb', cache: result.cache });
  } catch (error) {
    return movieProviderFailure(c, error);
  }
});

app.get('/api/health', (c) => ok(c, { status: 'ok', service: 'kairo-api', environment: c.env.APP_ENV ?? 'unknown' }));

// Live catalogue providers and independent episode-discovery providers. Public API paths remain stable. Each route below answers first when CATALOG_SOURCE is not "db" and otherwise falls through
// to the original D1 route registered further down, so the API paths and response shapes are unchanged.
const live = createLiveHandlers((input, init) => fetch(input, init));
const serveLive = (pick: (h: LiveHandlers) => (r: LiveRequest) => Promise<LiveResult>) => async (c: AppContext, next: Next) => {
  if (!isLiveMode(c.env.CATALOG_SOURCE)) return next();
  const result = await pick(live)({ query: c.req.query(), param: (name) => c.req.param(name), requestId: c.get('requestId'), env: c.env });
  return c.json(result.body as Record<string, unknown>, result.status as 200);
};
app.get('/api/ready', serveLive((h) => h.ready));
app.get('/api/v1/catalog/featured', serveLive((h) => h.featured));
app.get('/api/v1/catalog/trending', serveLive((h) => h.trending));
app.get('/api/v1/catalog/latest', serveLive((h) => h.latest));
app.get('/api/v1/catalog/search', serveLive((h) => h.search));
app.get('/api/v1/catalog/browse', serveLive((h) => h.browse));
app.get('/api/v1/catalog/genres', serveLive((h) => h.genres));
app.get('/api/v1/providers', serveLive((h) => h.providers));
app.get('/api/v1/anime/:id/episodes', serveLive((h) => h.episodes));
app.get('/api/v1/anime/:id/episodes/:episodeNumber/servers', serveLive((h) => h.servers));
app.get('/api/v1/anime/:id/episodes/:episodeNumber/servers/:serverId/playback', serveLive((h) => h.playback));
app.get('/api/v1/anime/:id/related', serveLive((h) => h.related));
app.get('/api/v1/anime/:id/metadata', serveLive((h) => h.metadata));
app.get('/api/v1/anime/:id', serveLive((h) => h.anime));

app.get('/api/v1/catalog/featured', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, slug, title, synopsis, poster_url AS posterUrl, banner_url AS bannerUrl,
              format, release_year AS releaseYear, season, status, rating,
              episode_count AS episodeCount, genres_json AS genresJson
       FROM anime WHERE featured = 1 ORDER BY popularity_score DESC, updated_at DESC LIMIT 12`
    ).all();
    const items = (result.results ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      genres: safeJsonArray(row.genresJson),
      genresJson: undefined,
    }));
    return ok(c, { items }, { count: items.length });
  } catch (error) {
    console.error(JSON.stringify({ event: 'catalog_featured_failed', requestId: c.get('requestId'), message: error instanceof Error ? error.message : 'unknown' }));
    return fail(c, 503, 'CATALOG_UNAVAILABLE', 'The catalogue is temporarily unavailable.');
  }
});

app.get('/api/ready', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    // Proves migrations 0001 and 0002 ran: a reachable but empty/unmigrated database must not report ready.
    const tables = await c.env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('anime', 'episodes', 'anime_provider_ids')`).all();
    if ((tables.results ?? []).length < 3) {
      logError(c, 'readiness_schema_missing', new Error('expected tables not found'));
      return fail(c, 503, 'CATALOG_UNAVAILABLE', 'The database is reachable but its schema is not up to date. Apply migrations.');
    }
    const providers = buildRegistry(c.env.METADATA_PROVIDERS, fetch).enabled.map((p) => p.id);
    return ok(c, { status: 'ready', database: 'ok', schema: 'ok', cache: c.env.METADATA_CACHE ? 'kv' : 'none', providers });
  } catch (error) {
    logError(c, 'readiness_failed', error);
    return fail(c, 503, 'CATALOG_UNAVAILABLE', 'The service is not ready.');
  }
});

function listRoute(kind: 'trending' | 'latest') {
  return async (c: AppContext) => {
    const paging = parsePagination(c.req.query());
    if (!paging.ok) return fail(c, 400, 'VALIDATION_ERROR', paging.message);
    const { page, limit, offset } = paging.value;
    const built = buildListQuery(kind, paging.value);
    try {
      const [items, count] = await Promise.all([
        c.env.DB.prepare(built.sql).bind(...built.binds).all(),
        c.env.DB.prepare(built.countSql).first<{ total: number }>(),
      ]);
      const total = Number(count?.total ?? 0);
      return ok(c, { items: (items.results ?? []).map((row: Record<string, unknown>) => toCard(row)) }, { page, limit, total, hasNextPage: offset + limit < total });
    } catch (error) {
      logError(c, `catalog_${kind}_failed`, error);
      return fail(c, 503, 'CATALOG_UNAVAILABLE', 'The catalogue is temporarily unavailable.');
    }
  };
}
app.get('/api/v1/catalog/trending', listRoute('trending'));
app.get('/api/v1/catalog/latest', listRoute('latest'));

app.get('/api/v1/catalog/search', async (c) => {
  const parsed = parseSearchParams(c.req.query());
  if (!parsed.ok) return fail(c, 400, 'VALIDATION_ERROR', parsed.message);
  const { page, limit, offset } = parsed.value;
  const built = buildSearchQuery(parsed.value);
  try {
    const [items, count] = await Promise.all([
      c.env.DB.prepare(built.sql).bind(...built.binds).all(),
      c.env.DB.prepare(built.countSql).bind(...built.countBinds).first<{ total: number }>(),
    ]);
    const total = Number(count?.total ?? 0);
    return ok(c, { items: (items.results ?? []).map((row: Record<string, unknown>) => toCard(row)) }, { page, limit, total, hasNextPage: offset + limit < total });
  } catch (error) {
    logError(c, 'catalog_search_failed', error);
    return fail(c, 503, 'CATALOG_UNAVAILABLE', 'Search is temporarily unavailable.');
  }
});

app.get('/api/v1/catalog/genres', async (c) => {
  try {
    const result = await c.env.DB.prepare(GENRES_SQL).all<{ name: string; count: number }>();
    return ok(c, { items: result.results ?? [] });
  } catch (error) {
    logError(c, 'catalog_genres_failed', error);
    return fail(c, 503, 'CATALOG_UNAVAILABLE', 'Genres are temporarily unavailable.');
  }
});

app.get('/api/v1/anime/:id', async (c) => {
  const id = c.req.param('id');
  if (!id || id.length > 128) return fail(c, 400, 'VALIDATION_ERROR', 'Invalid anime identifier.');
  try {
    const row = await c.env.DB.prepare(
      `SELECT id, slug, title, alt_titles_json AS altTitlesJson, synopsis,
              poster_url AS posterUrl, banner_url AS bannerUrl, format,
              release_year AS releaseYear, season, status, rating,
              episode_count AS episodeCount, genres_json AS genresJson
       FROM anime WHERE id = ? OR slug = ? LIMIT 1`
    ).bind(id, id).first<Record<string, unknown>>();
    if (!row) return fail(c, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
    return ok(c, { ...row, altTitles: safeJsonArray(row.altTitlesJson), genres: safeJsonArray(row.genresJson), altTitlesJson: undefined, genresJson: undefined });
  } catch (error) {
    console.error(JSON.stringify({ event: 'anime_details_failed', requestId: c.get('requestId'), message: error instanceof Error ? error.message : 'unknown' }));
    return fail(c, 503, 'CATALOG_UNAVAILABLE', 'Title details are temporarily unavailable.');
  }
});

app.get('/api/v1/anime/:id/episodes', async (c) => {
  const id = c.req.param('id');
  const page = boundedInt(c.req.query('page'), 1, 1, 500);
  const limit = boundedInt(c.req.query('limit'), 50, 1, 100);
  if (!id || id.length > 128 || page === null || limit === null) return fail(c, 400, 'VALIDATION_ERROR', 'Invalid title or pagination values.');
  try {
    const anime = await c.env.DB.prepare('SELECT id FROM anime WHERE id = ? OR slug = ? LIMIT 1').bind(id, id).first<{ id: string }>();
    if (!anime) return fail(c, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
    const offset = (page - 1) * limit;
    const [items, count] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, anime_id AS animeId, episode_number AS episodeNumber, title,
                synopsis, thumbnail_url AS thumbnailUrl, duration_seconds AS durationSeconds,
                published_at AS publishedAt
         FROM episodes WHERE anime_id = ? ORDER BY episode_number LIMIT ? OFFSET ?`
      ).bind(anime.id, limit, offset).all(),
      c.env.DB.prepare('SELECT COUNT(*) AS total FROM episodes WHERE anime_id = ?').bind(anime.id).first<{ total: number }>(),
    ]);
    const total = Number(count?.total ?? 0);
    return ok(c, { items: items.results ?? [] }, { page, limit, total, hasNextPage: offset + limit < total });
  } catch (error) {
    console.error(JSON.stringify({ event: 'episodes_failed', requestId: c.get('requestId'), message: error instanceof Error ? error.message : 'unknown' }));
    return fail(c, 503, 'CATALOG_UNAVAILABLE', 'Episode information is temporarily unavailable.');
  }
});

app.get('/api/v1/anime/:id/related', async (c) => {
  const id = parseId(c.req.param('id'));
  const limit = boundedInt(c.req.query('limit'), 12, 1, 24);
  if (id === null || limit === null) return fail(c, 400, 'VALIDATION_ERROR', 'Invalid title identifier or limit.');
  try {
    const source = await c.env.DB.prepare('SELECT id, genres_json AS genresJson FROM anime WHERE id = ? OR slug = ? LIMIT 1').bind(id, id).first<{ id: string; genresJson: string }>();
    if (!source) return fail(c, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
    const genres = safeJsonArray(source.genresJson).filter((g): g is string => typeof g === 'string');
    if (genres.length === 0) return ok(c, { items: [] }, { basis: 'shared_genres', limit });
    const built = buildRelatedQuery(source.id, genres, limit);
    const result = await c.env.DB.prepare(built.sql).bind(...built.binds).all();
    return ok(c, { items: (result.results ?? []).map((row: Record<string, unknown>) => toCard(row)) }, { basis: 'shared_genres', limit });
  } catch (error) {
    logError(c, 'anime_related_failed', error);
    return fail(c, 503, 'CATALOG_UNAVAILABLE', 'Related titles are temporarily unavailable.');
  }
});

app.get('/api/v1/providers', (c) => {
  const registry = buildRegistry(c.env.METADATA_PROVIDERS, fetch);
  return ok(c, { items: registry.info, unknownConfigured: registry.unknown });
});

// Unified, multi-provider view of one title. The stored catalogue row is always the floor: if every provider fails, this still answers.
app.get('/api/v1/anime/:id/metadata', async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return fail(c, 400, 'VALIDATION_ERROR', 'Invalid anime identifier.');
  try {
    const row = await c.env.DB.prepare(BASE_RECORD_SQL).bind(id, id).first<BaseRow>();
    if (!row) return fail(c, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
    const mappings = (await c.env.DB.prepare(PROVIDER_IDS_SQL).bind(row.id).all<{ provider: string; externalId: string }>()).results ?? [];
    const registry = buildRegistry(c.env.METADATA_PROVIDERS, fetch);
    const { payload, discovered, degraded } = await resolveUnified(toBaseRecord(row, mappings), registry.enabled, { cache: createCache(c.env), breaker: sharedBreaker });
    for (const d of discovered) {
      try { await c.env.DB.prepare(INSERT_PROVIDER_ID_SQL).bind(row.id, d.provider, d.externalId, d.confidence).run(); } catch (error) { logError(c, 'provider_id_save_failed', error); }
    }
    return ok(c, payload, { degraded, basis: 'multi_provider' });
  } catch (error) {
    logError(c, 'anime_metadata_failed', error);
    return fail(c, 503, 'CATALOG_UNAVAILABLE', 'Title metadata is temporarily unavailable.');
  }
});


// Experimental YouTube.js subscriptions-feed probe. Staging only; cookie is request-scoped and never persisted or logged.
app.post('/api/staging/youtube/feed', async (c) => {
  if (c.env.APP_ENV !== 'staging') return fail(c, 404, 'RESOURCE_NOT_FOUND', 'The requested API route was not found.');
  if (!c.env.YOUTUBE_STAGING_TOKEN) return fail(c, 503, 'FEATURE_NOT_CONFIGURED', 'The staging YouTube test is not configured.');
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This test can only be used from the Kairo staging site.');
  const authorization = c.req.header('Authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expected = c.env.YOUTUBE_STAGING_TOKEN;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(suppliedToken)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(providedHash);
  const b = new Uint8Array(expectedHash);
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  if (!suppliedToken || mismatch !== 0) return fail(c, 401, 'STAGING_AUTH_REQUIRED', 'The staging access token is missing or incorrect.');

  let body: { cookie?: unknown; maxPages?: unknown };
  try { body = await c.req.json(); } catch { return fail(c, 400, 'VALIDATION_ERROR', 'Provide a valid JSON request.'); }
  const cookie = typeof body.cookie === 'string' ? body.cookie.trim() : '';
  if (!cookie || cookie.length > 16000 || /[\r\n]/.test(cookie)) {
    return fail(c, 400, 'VALIDATION_ERROR', 'Provide a valid YouTube Cookie header (maximum 16 KB).');
  }
  const maxPages = typeof body.maxPages === 'number' && Number.isFinite(body.maxPages)
    ? Math.min(3, Math.max(1, Math.floor(body.maxPages))) : 1;

  try {
    const innertube = await Innertube.create({ cookie, enable_session_cache: false });
    let feed = await innertube.getSubscriptionsFeed();
    const videosById = new Map<string, Record<string, unknown>>();
    for (let page = 1; page <= maxPages; page += 1) {
      for (const video of feed.videos ?? []) {
        // Feed.videos is a union of several YouTube.js renderer types. Some entries
        // are not ordinary videos, so inspect the runtime shape instead of assuming
        // every union member exposes the same properties.
        const item = video as unknown as Record<string, unknown>;
        const asRecord = (value: unknown): Record<string, unknown> | null =>
          value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
        const asText = (value: unknown): string => {
          if (value == null) return '';
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
          const textValue = asRecord(value)?.text;
          if (typeof textValue === 'string') return textValue;
          const toString = asRecord(value)?.toString;
          return typeof toString === 'function' ? String(toString.call(value)) : '';
        };

        const videoId = typeof item.video_id === 'string'
          ? item.video_id
          : typeof item.id === 'string' ? item.id : '';
        if (!videoId) continue;

        const author = asRecord(item.author);
        const duration = asRecord(item.duration);
        const bestThumbnail = asRecord(item.best_thumbnail);
        const thumbnails = Array.isArray(item.thumbnails) ? item.thumbnails : [];
        const firstThumbnail = asRecord(thumbnails[0]);
        const thumbnail = bestThumbnail?.url ?? firstThumbnail?.url;

        videosById.set(videoId, {
          videoId,
          title: asText(item.title),
          channelTitle: asText(author?.name),
          published: asText(item.published),
          viewCount: asText(item.short_view_count ?? item.view_count),
          duration: asText(duration?.text ?? item.length_text) || null,
          isLive: Boolean(item.is_live),
          thumbnail: typeof thumbnail === 'string' ? thumbnail : null,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
        });
      }
      if (page === maxPages || !feed.has_continuation) break;
      feed = await feed.getContinuation();
    }
    return ok(c, { count: videosById.size, videos: [...videosById.values()] }, { pagesRequested: maxPages });
  } catch {
    // Do not log request bodies, cookies, upstream response details, or authentication material.
    return fail(c, 503, 'YOUTUBE_FEED_FAILED', 'YouTube did not return the subscriptions feed. The session may be expired, verification may be required, or the staging server IP may be blocked.');
  }
});

// Session-backed account endpoints. User IDs always come from the validated session cookie.
app.get('/api/v1/me', async (c) => {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to access your profile.');
  return ok(c, { user });
});

app.post('/api/v1/me/history/sync', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) {
    return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
  }
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to sync watch history.');
  let body: unknown;
  try { body = await c.req.json(); } catch { return fail(c, 400, 'VALIDATION_ERROR', 'Provide valid JSON.'); }
  const request = body as { items?: unknown; deleted?: unknown; clear?: unknown } | null;
  const input = request?.items;
  const deleted = Array.isArray(request?.deleted) ? request.deleted : [];
  const clear = request?.clear === true;
  if (!Array.isArray(input) || input.length > 100 || deleted.length > 100 || input.length + deleted.length > 100) {
    return fail(c, 400, 'VALIDATION_ERROR', 'Watch history updates must contain at most 100 entries.');
  }
  const statements: D1PreparedStatement[] = [];
  if (clear) {
    statements.push(c.env.DB.prepare('DELETE FROM user_watch_history WHERE user_id = ?').bind(user.id));
  }
  for (const value of input) {
    if (!value || typeof value !== 'object') continue;
    if (clear) break;
    const item = value as Record<string, unknown>;
    const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const episodeNumber = Number(item.episodeNumber);
    const updatedAt = Number(item.updatedAt);
    if (!slug || slug.length > 128 || !title || title.length > 300 ||
        !Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 100000 ||
        !Number.isFinite(updatedAt) || updatedAt < 0) continue;
    const posterUrl = typeof item.posterUrl === 'string' && item.posterUrl.length <= 2048 ? item.posterUrl : null;
    const episodeTitle = typeof item.episodeTitle === 'string' ? item.episodeTitle.slice(0, 300) : '';
    const duration = Number(item.durationSeconds);
    const progress = Number(item.progressSeconds);
    statements.push(c.env.DB.prepare(`
      INSERT INTO user_watch_history
        (user_id, anime_slug, episode_number, title, poster_url, episode_title,
         duration_seconds, progress_seconds, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, anime_slug, episode_number) DO UPDATE SET
        title=excluded.title, poster_url=excluded.poster_url,
        episode_title=excluded.episode_title, duration_seconds=excluded.duration_seconds,
        progress_seconds=excluded.progress_seconds, updated_at=excluded.updated_at
      WHERE excluded.updated_at > user_watch_history.updated_at
    `).bind(user.id, slug, episodeNumber, title, posterUrl, episodeTitle,
      Number.isFinite(duration) && duration > 0 ? Math.min(86400, Math.floor(duration)) : null,
      Number.isFinite(progress) && progress >= 0 ? Math.min(86400, progress) : 0,
      Math.floor(updatedAt)));
  }
  if (!clear) {
    for (const value of deleted) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Record<string, unknown>;
      const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
      const episodeNumber = Number(item.episodeNumber);
      if (slug && slug.length <= 128 && Number.isInteger(episodeNumber) && episodeNumber > 0 && episodeNumber <= 100000) {
        statements.push(c.env.DB.prepare('DELETE FROM user_watch_history WHERE user_id = ? AND anime_slug = ? AND episode_number = ?').bind(user.id, slug, episodeNumber));
      }
    }
  }
  try {
    if (statements.length) await c.env.DB.batch(statements);
    const result = await c.env.DB.prepare(`
      SELECT anime_slug AS slug, title, poster_url AS posterUrl,
             episode_number AS episodeNumber, episode_title AS episodeTitle,
             duration_seconds AS durationSeconds, progress_seconds AS progressSeconds,
             updated_at AS updatedAt
      FROM user_watch_history WHERE user_id = ?
      ORDER BY updated_at DESC LIMIT 100
    `).bind(user.id).all();
    return ok(c, { items: result.results ?? [] }, { count: result.results?.length ?? 0 });
  } catch (error) {
    logError(c, 'watch_history_sync_failed', error);
    return fail(c, 503, 'HISTORY_UNAVAILABLE', 'Watch history sync is temporarily unavailable.');
  }
});

app.get('/api/v1/me/library', async (c) => {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to access your library.');
  try {
    const result = await c.env.DB.prepare(
      `SELECT l.anime_id AS animeId, l.status, l.is_favorite AS isFavorite,
              l.added_at AS addedAt, l.updated_at AS updatedAt,
              a.slug, a.title, a.poster_url AS posterUrl, a.banner_url AS bannerUrl,
              a.format, a.release_year AS releaseYear, a.rating, a.episode_count AS episodeCount
       FROM user_library l
       INNER JOIN anime a ON a.id = l.anime_id
       WHERE l.user_id = ?
       ORDER BY l.updated_at DESC
       LIMIT 200`
    ).bind(user.id).all();
    return ok(c, { items: result.results ?? [] }, { count: result.results?.length ?? 0 });
  } catch (error) {
    logError(c, 'user_library_failed', error);
    return fail(c, 503, 'LIBRARY_UNAVAILABLE', 'Your library is temporarily unavailable.');
  }
});

app.post('/api/v1/auth/logout', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) {
    return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
  }
  try {
    await revokeSession(c.env.DB, c.req.header('Cookie') ?? null);
    c.header('Set-Cookie', clearSessionCookie(new URL(c.req.url).protocol === 'https:'));
    return ok(c, { signedOut: true });
  } catch (error) {
    logError(c, 'auth_logout_failed', error);
    return fail(c, 503, 'AUTH_UNAVAILABLE', 'Could not sign out. Please try again.');
  }
});
app.get('/api/v1/anime/:id/episodes/:episodeNumber/servers/:serverId/playback', (c) => fail(c, 503, 'SOURCE_UNAVAILABLE', 'Live playback is not enabled for this catalogue configuration.'));

app.notFound((c) => fail(c, 404, 'RESOURCE_NOT_FOUND', 'The requested API route was not found.'));
app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'unhandled_worker_error', requestId: c.get('requestId'), message: error.message }));
  return fail(c, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
});

function toCard(row: Record<string, unknown>) {
  return { ...row, genres: safeJsonArray(row.genresJson), genresJson: undefined };
}

function logError(c: AppContext, event: string, error: unknown) {
  console.error(JSON.stringify({ event, requestId: c.get('requestId'), message: error instanceof Error ? error.message : 'unknown' }));
}

function safeJsonArray(value: unknown): unknown[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default app;
