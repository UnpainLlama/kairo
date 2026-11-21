/// <reference types="@cloudflare/workers-types" />
import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import { boundedInt, parseId, parsePagination, parseSearchParams } from './lib/validation';
import { clearSessionCookie, createSession, findSessionUser, readSessionCookie, revokeSession, sessionCookie } from './auth/session';
import { registerAuthRoutes } from './auth/routes';
import { registerYouTubeMediaRoutes } from './youtube/routes';
import { registerAdminRoutes, rotateAdminConsolePath } from './admin/routes';
import { hasActiveAccessAccount, verifyCloudflareAccessAssertion } from './auth/cloudflareAccess';
import { GENRES_SQL, buildListQuery, buildRelatedQuery, buildSearchQuery } from './repositories/catalog';
import { BASE_RECORD_SQL, INSERT_PROVIDER_ID_SQL, PROVIDER_IDS_SQL } from './repositories/providerIds';
import { buildRegistry, createCache, resolveUnified, sharedBreaker, toBaseRecord, type BaseRow } from './metadata/service';
import { createLiveHandlers, isLiveMode, type LiveHandlers } from './live/handlers';
import type { LiveRequest, LiveResult } from './live/types';
import { createTmdbMovieProvider } from './movies/providers/tmdb';
import { createMovieCatalogService } from './movies/service';
import { movieIdentity, persistMovieDetail, persistMovieSummary, searchStoredMovies } from './movies/repository';
import type { MovieDiscoverQuery, MovieListKind } from './movies/types';
import { ProviderError } from './metadata/types';
import { consumeRateLimit } from './auth/rateLimit';
import { isStaticAssetPath } from './lib/staticAssets';

interface Bindings {
  DB: D1Database;
  ASSETS?: Fetcher;
  ADMIN_BOOTSTRAP_TOKEN?: string;
  ACCESS_ENFORCED?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  APP_ENV?: string;
  APP_BASE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Base64url-encoded 32-byte AES-GCM key used only for YouTube OAuth token encryption. */
  YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;
  /** Server-only Google API key for administrator-only YouTube Data API reads. */
  YOUTUBE_DATA_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
  /** Comma-separated metadata provider ids to enable, e.g. "anilist". Empty = none. */
  METADATA_PROVIDERS?: string;
  /** Optional Workers KV namespace used as the provider-response cache (recommended on workers.dev). */
  METADATA_CACHE?: KVNamespace;
  /** "live" (default): serve the public catalogue from live providers; account, library and history routes still use D1. "db": use the original D1 catalogue routes. */
  CATALOG_SOURCE?: string;
  /** Catalogue-provider priority, comma-separated. */
  LIVE_PROVIDERS?: string;
  /** Registered MyAnimeList API Client ID stored as a Worker secret. */
  MAL_CLIENT_ID?: string;
  /** Independent episode-provider priority, e.g. "hianime,jikan". */
  EPISODE_PROVIDERS?: string;
  /** HiAnime mirror base URL; adapter enforces a fixed HTTPS host allowlist. */
  HIANIME_BASE_URL?: string;
  /** Opt-in to ZokoAnime's documented iframe route; disabled unless explicitly set to true. */
  ZOKOANIME_EMBED_ENABLED?: string;
  /** TMDB API Read Access Token stored as a Cloudflare Worker secret. */
  TMDB_ACCESS_TOKEN?: string;
  /** Enable TMDB-powered Movies discovery/search only after credentials and provider terms are approved. */
  MOVIES_TMDB_ENABLED?: string;
  /** Explicit owner approval for the provider's applicable licence, caching, and attribution terms. */
  MOVIES_TMDB_TERMS_APPROVED?: string;
  /** Enable admin-only incremental D1 ingestion. Requires MOVIES_TMDB_TERMS_APPROVED=true. */
  MOVIES_INGESTION_ENABLED?: string;
}

type Variables = { requestId: string; accessEmail: string | null; accessSubject: string | null };
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
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method.toUpperCase())) return next();
  const expectedOrigin = new URL(c.req.url).origin;
  const origin = c.req.header('Origin');
  let requestOrigin = origin ?? null;
  if (!requestOrigin) {
    const referer = c.req.header('Referer');
    if (referer) {
      try { requestOrigin = new URL(referer).origin; } catch { requestOrigin = null; }
    }
  }
  if (requestOrigin !== expectedOrigin) {
    return c.json({
      success: false,
      error: { code: 'ORIGIN_FORBIDDEN', message: 'This request origin is not allowed.' },
      meta: { requestId: c.get('requestId') },
    }, 403);
  }
  return next();
});

app.use('/api/*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  // These two minimal probes are public only when Cloudflare's Worker destination
  // has exact public path overrides for these paths. Every other API requires Access.
  if (pathname === '/api/health' || pathname === '/api/ready') {
    c.set('accessEmail', null);
    c.set('accessSubject', null);
    return next();
  }
  if (c.env.ACCESS_ENFORCED !== 'true') {
    c.set('accessEmail', null);
    return next();
  }
  const teamDomain = c.env.ACCESS_TEAM_DOMAIN;
  const audience = c.env.ACCESS_AUD;
  if (!teamDomain || !audience) {
    return c.json({ success: false, error: { code: 'ACCESS_CONFIGURATION_REQUIRED', message: 'Access identity verification is not configured.' } }, 503);
  }
  const identity = await verifyCloudflareAccessAssertion(
    c.req.header('Cf-Access-Jwt-Assertion') ?? null,
    { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: audience },
  );
  if (!identity) {
    c.header('Set-Cookie', clearSessionCookie(new URL(c.req.url).protocol === 'https:'));
    return c.json({ success: false, error: { code: 'ACCESS_REQUIRED', message: 'A valid approved Cloudflare Access identity is required.' } }, 401);
  }
  c.set('accessEmail', identity.email);
  c.set('accessSubject', identity.subject);
  // The Access email selector is checked at login, not on every active token.
  // Keep a live Kairo-side allow check so suspending/removing an invite blocks API use immediately.
  // Initial admin bootstrap is the only exception and remains protected by the signed Access JWT
  // plus the one-time bootstrap Worker secret.
  // Resolve/provision new Access users only during the account bootstrap endpoint.
  // All other API calls perform the active-account check without creating profiles.
  if (pathname !== '/api/v1/admin/bootstrap' && pathname !== '/api/v1/me') {
    const activeInvite = await hasActiveAccessAccount(c.env.DB, identity.email, identity.subject);
    if (!activeInvite) {
      return c.json({ success: false, error: { code: 'ACCESS_ACCOUNT_DISABLED', message: 'This Access identity does not have an active Kairo account. Contact the site administrator.' } }, 403);
    }
  }
  return next();
});

app.use('/api/*', async (c, next) => {
  const origin = c.env.ALLOWED_ORIGIN;
  if (origin) {
    return cors({ origin, allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization', 'X-Kairo-Bootstrap', 'X-Requested-With'], credentials: true })(c, next);
  }
  await next();
});

// Bound the most expensive public catalogue and provider endpoints by a hashed client key.
// The raw Cloudflare client IP is never written to D1 by this limiter.
app.use('/api/v1/*', async (c, next) => {
  if (c.req.method !== 'GET') return next();
  const pathname = new URL(c.req.url).pathname;
  let bucket: string | null = null;
  let limit = 0;
  const windowMs = 15 * 60 * 1000;
  if (pathname === '/api/v1/catalog/search' || pathname === '/api/v1/movies/search') {
    bucket = 'catalog-search';
    limit = 40;
  } else if (
    pathname.startsWith('/api/v1/catalog/') ||
    pathname === '/api/v1/movies/discover' ||
    pathname === '/api/v1/movies/genres'
  ) {
    bucket = 'catalog-read';
    limit = 120;
  } else if (/^\/api\/v1\/anime\/[^/]+\/episodes\/[^/]+\/servers(?:\/[^/]+\/playback)?$/.test(pathname)) {
    bucket = 'episode-source';
    limit = 24;
  }
  if (!bucket) return next();
  const clientKey = c.req.header('CF-Connecting-IP') ?? c.get('accessSubject') ?? c.get('accessEmail') ?? 'unknown';
  try {
    const allowed = await consumeRateLimit(c.env.DB, String(clientKey), bucket, limit, windowMs);
    if (!allowed) {
      c.header('Retry-After', '60');
      return fail(c, 429, 'RATE_LIMITED', 'Too many requests. Please wait a minute and try again.');
    }
  } catch (error) {
    logError(c, 'api_rate_limit_unavailable', error);
    return fail(c, 503, 'RATE_LIMIT_UNAVAILABLE', 'This service is temporarily unable to verify its request limit.');
  }
  return next();
});

app.use('/api/v1/me', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});
app.use('/api/v1/me/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
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
registerAdminRoutes(app);

function moviesProviderEnabled(c: AppContext): boolean {
  return c.env.MOVIES_TMDB_ENABLED === 'true' && c.env.MOVIES_TMDB_TERMS_APPROVED === 'true';
}

function movieCatalog(c: AppContext) {
  const provider = createTmdbMovieProvider(fetch, c.env.TMDB_ACCESS_TOKEN);
  return createMovieCatalogService(provider, createCache(c.env));
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
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to continue.');
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
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to continue.');
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

app.get('/api/health', (c) => ok(c, { status: 'ok', service: 'kairo-api' }));

// Live catalogue providers and independent episode-discovery providers. Public API paths remain stable. Each route below answers first when CATALOG_SOURCE is not "db" and otherwise falls through
// to the original D1 route registered further down, so the API paths and response shapes are unchanged.
const live = createLiveHandlers((input, init) => fetch(input, init));
const serveLive = (pick: (h: LiveHandlers) => (r: LiveRequest) => Promise<LiveResult>) => async (c: AppContext, next: Next) => {
  if (!isLiveMode(c.env.CATALOG_SOURCE)) return next();
  const result = await pick(live)({ query: c.req.query(), param: (name) => c.req.param(name), requestId: c.get('requestId'), env: c.env });
  return c.json(result.body as Record<string, unknown>, result.status as 200);
};
app.get('/api/ready', async (c: AppContext, next: Next) => {
  if (!isLiveMode(c.env.CATALOG_SOURCE)) return next();
  const result = await live.ready({
    query: c.req.query(),
    param: (name) => c.req.param(name),
    requestId: c.get('requestId'),
    env: c.env,
  });
  if (c.env.ACCESS_ENFORCED === 'true' && result.status === 200) {
    return ok(c, { status: 'ready' });
  }
  return c.json(result.body as Record<string, unknown>, result.status as 200);
});
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
    return c.env.ACCESS_ENFORCED === 'true'
      ? ok(c, { status: 'ready' })
      : ok(c, { status: 'ready', database: 'ok', schema: 'ok', cache: c.env.METADATA_CACHE ? 'kv' : 'none', providers });
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


app.get('/api/v1/me', async (c) => {
  const accessEmail = c.get('accessEmail') as string | null | undefined;
  const cookieHeader = c.req.header('Cookie') ?? null;
  const existing = await findSessionUser(c.env.DB, cookieHeader, Date.now(), accessEmail, c.get('accessSubject') as string | null | undefined);
  if (existing) return ok(c, { user: existing }, { authProvider: c.env.ACCESS_ENFORCED === 'true' ? 'cloudflare_access' : 'local_session' });

  // In the closed-access deployment, Cloudflare Access is the only interactive
  // sign-in. Issue the internal HttpOnly Kairo session automatically so existing
  // account-scoped APIs (history, libraries, playback and YouTube OAuth) retain a
  // stable user id without asking the user for a second username/password.
  if (c.env.ACCESS_ENFORCED === 'true') {
    if (!accessEmail) {
      c.header('Set-Cookie', clearSessionCookie(new URL(c.req.url).protocol === 'https:'));
      return fail(c, 401, 'ACCESS_REQUIRED', 'Authenticate with your approved email through Cloudflare Access.');
    }
    // A present but invalidated Kairo cookie means the session expired or was revoked.
    // Do not silently mint a replacement for an already-authenticated Access browser:
    // require a fresh Access login, especially for the shorter administrator idle window.
    if (readSessionCookie(cookieHeader)) {
      c.header('Set-Cookie', clearSessionCookie(new URL(c.req.url).protocol === 'https:'));
      return fail(c, 401, 'ACCESS_REAUTH_REQUIRED', 'Your Kairo session expired. Reauthenticate through Cloudflare Access to continue.');
    }
    try {
      // First-time provisioning belongs to /me, not arbitrary API middleware.
      if (!await hasActiveAccessAccount(c.env.DB, accessEmail, c.get('accessSubject') as string | null | undefined)) {
        const existingProfile = await c.env.DB.prepare(
          'SELECT id FROM user_profiles WHERE access_email = ? COLLATE NOCASE OR (access_email IS NULL AND email = ? COLLATE NOCASE) LIMIT 1',
        ).bind(accessEmail, accessEmail).first<{ id: string }>();
        if (!existingProfile) {
          const allocation = await c.env.DB.prepare(
            "SELECT COUNT(*) AS total FROM user_profiles WHERE role = 'user'",
          ).first<{ total: number }>();
          if (Number(allocation?.total ?? 0) >= 15) {
            return fail(c, 403, 'ACCESS_ACCOUNT_LIMIT_REACHED', 'All 15 Kairo standard-account places are allocated. Contact the Kairo administrator to request access.');
          }
        }
        return fail(c, 403, 'ACCESS_ACCOUNT_DISABLED', 'This Access identity does not have an active Kairo account. Contact the site administrator.');
      }
      const bootstrap = await c.env.DB.prepare(
        `SELECT admin_bootstrap_completed_at AS completedAt,
                EXISTS (SELECT 1 FROM user_profiles WHERE role = 'admin') AS adminExists
         FROM app_security_state WHERE singleton_id = 1`,
      ).first<{ completedAt: number | null; adminExists: number }>();
      if (bootstrap && bootstrap.completedAt === null && Number(bootstrap.adminExists) === 0) {
        return fail(c, 401, 'ADMIN_SETUP_REQUIRED', 'The initial Kairo administrator must complete one-time setup.');
      }
      const account = await c.env.DB.prepare(
        "SELECT id, role, account_status AS accountStatus FROM user_profiles WHERE access_email = ? COLLATE NOCASE LIMIT 1",
      ).bind(accessEmail).first<{ id: string; role: 'user' | 'admin'; accountStatus: string }>();
      if (!account || account.accountStatus !== 'active') {
        return fail(c, 403, 'ACCESS_ACCOUNT_DISABLED', 'This Access identity does not have an active Kairo account.');
      }
      const ttlSeconds = account.role === 'admin' ? 8 * 60 * 60 : 30 * 24 * 60 * 60;
      const session = await createSession(c.env.DB, account.id, {
        ttlSeconds,
        accessEmail,
        accessSubject: c.get('accessSubject') as string | null | undefined,
      });
      c.header('Set-Cookie', sessionCookie(session.token, new URL(c.req.url).protocol === 'https:', session.ttlSeconds));
      const user = await findSessionUser(c.env.DB, `kairo_session=${session.token}`, Date.now(), accessEmail, c.get('accessSubject') as string | null | undefined);
      if (!user) return fail(c, 503, 'ACCOUNT_SESSION_UNAVAILABLE', 'Your Kairo account was found but its session could not be established.');
      return ok(c, { user }, { authProvider: 'cloudflare_access', sessionCreated: true });
    } catch (error) {
      logError(c, 'access_account_session_failed', error);
      return fail(c, 503, 'ACCOUNT_SESSION_UNAVAILABLE', 'Kairo could not establish your account session. Please refresh and try again.');
    }
  }

  // Without Cloudflare Access enforcement (local development), no account session
  // means guest mode. Guests keep device-local state and never write to D1.
  return fail(c, 401, 'AUTH_REQUIRED', 'No Kairo account session is active.');
});

app.get('/api/v1/me/playback', async (c) => {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to restore playback progress.');
  const mediaType = c.req.query('mediaType');
  const mediaKey = c.req.query('mediaKey');
  if (mediaType && !['anime', 'movie', 'youtube'].includes(mediaType)) return fail(c, 400, 'VALIDATION_ERROR', 'The media type is invalid.');
  if (mediaType === 'youtube' && user.role !== 'admin') return fail(c, 404, 'NOT_FOUND', 'Not found.');
  if (mediaKey && (!mediaType || !mediaKey.trim() || mediaKey.length > 256)) return fail(c, 400, 'VALIDATION_ERROR', 'The media playback key is invalid.');
  c.header('Cache-Control', 'no-store');
  const limit = boundedInt(c.req.query('limit'), 50, 1, 100);
  if (limit === null) return fail(c, 400, 'VALIDATION_ERROR', 'The playback list limit is invalid.');
  try {
    const columns = `media_type AS mediaType, media_key AS mediaKey, title,
      artwork_url AS artworkUrl, duration_seconds AS durationSeconds,
      progress_seconds AS progressSeconds, completed,
      player_state_json AS playerStateJson, updated_at AS updatedAt`;
    const mapRow = (row: Record<string, unknown>) => {
      let playerState: unknown = {};
      try { playerState = JSON.parse(String(row.playerStateJson ?? '{}')); } catch { playerState = {}; }
      return {
        mediaType: row.mediaType, mediaKey: row.mediaKey, title: row.title,
        artworkUrl: row.artworkUrl ?? null, durationSeconds: row.durationSeconds ?? null,
        progressSeconds: Number(row.progressSeconds ?? 0), completed: Number(row.completed) === 1,
        playerState, updatedAt: Number(row.updatedAt ?? 0),
      };
    };
    if (mediaKey) {
      const row = await c.env.DB.prepare(`SELECT ${columns} FROM user_media_playback WHERE user_id=? AND media_type=? AND media_key=? LIMIT 1`)
        .bind(user.id, mediaType, mediaKey).first<Record<string, unknown>>();
      return ok(c, { item: row ? mapRow(row) : null });
    }
    const result = await c.env.DB.prepare(`SELECT ${columns} FROM user_media_playback WHERE user_id=? ${mediaType ? 'AND media_type=?' : user.role !== 'admin' ? "AND media_type!='youtube'" : ''} ORDER BY updated_at DESC LIMIT ?`)
      .bind(...(mediaType ? [user.id, mediaType, limit] : [user.id, limit])).all<Record<string, unknown>>();
    return ok(c, { items: (result.results ?? []).map(mapRow) }, { count: result.results?.length ?? 0 });
  } catch (error) {
    logError(c, 'media_playback_read_failed', error);
    return fail(c, 503, 'PLAYBACK_UNAVAILABLE', 'Your playback progress is temporarily unavailable.');
  }
});

app.delete('/api/v1/me/playback', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to delete playback progress.');
  const mediaType = c.req.query('mediaType');
  const mediaKey = c.req.query('mediaKey');
  if (!mediaType || !['anime', 'movie', 'youtube'].includes(mediaType) ||
      (mediaKey !== undefined && (!mediaKey.trim() || mediaKey.length > 256))) {
    return fail(c, 400, 'VALIDATION_ERROR', 'The playback record to delete is invalid.');
  }
  if (mediaType === 'youtube' && user.role !== 'admin') return fail(c, 404, 'NOT_FOUND', 'Not found.');
  try {
    const result = mediaKey
      ? await c.env.DB.prepare('DELETE FROM user_media_playback WHERE user_id=? AND media_type=? AND media_key=?').bind(user.id, mediaType, mediaKey).run()
      : await c.env.DB.prepare('DELETE FROM user_media_playback WHERE user_id=? AND media_type=?').bind(user.id, mediaType).run();
    return ok(c, { removed: true, changes: result.meta.changes ?? 0 });
  } catch (error) {
    logError(c, 'media_playback_delete_failed', error);
    return fail(c, 503, 'PLAYBACK_UNAVAILABLE', 'Could not delete playback progress.');
  }
});

app.post('/api/v1/me/playback', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to sync playback progress.');
  let body: unknown;
  try { body = await c.req.json(); } catch { return fail(c, 400, 'VALIDATION_ERROR', 'Provide valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(c, 400, 'VALIDATION_ERROR', 'Provide a playback progress record.');
  const item = body as Record<string, unknown>;
  const mediaType = typeof item.mediaType === 'string' ? item.mediaType : '';
  if (mediaType === 'youtube' && user.role !== 'admin') return fail(c, 404, 'NOT_FOUND', 'Not found.');
  const mediaKey = typeof item.mediaKey === 'string' ? item.mediaKey.trim() : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const progress = Number(item.progressSeconds);
  const duration = item.durationSeconds === null || item.durationSeconds === undefined ? null : Number(item.durationSeconds);
  const syncSessionId = typeof item.syncSessionId === 'string' ? item.syncSessionId : '';
  const syncSequence = Number(item.syncSequence);
  if (!['anime', 'movie', 'youtube'].includes(mediaType) || !mediaKey || mediaKey.length > 256 ||
      /[\u0000-\u001f]/.test(mediaKey) || !title || title.length > 300 ||
      !Number.isFinite(progress) || progress < 0 || progress > 86400 ||
      (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > 86400)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(syncSessionId) ||
      !Number.isSafeInteger(syncSequence) || syncSequence < 1 || syncSequence > 2_147_483_647) {
    return fail(c, 400, 'VALIDATION_ERROR', 'The playback progress record is invalid.');
  }
  if (mediaType === 'movie' && !/^\d{1,12}$/.test(mediaKey)) return fail(c, 400, 'VALIDATION_ERROR', 'The movie playback key must be a TMDB ID.');
  if (mediaType === 'youtube' && !/^[A-Za-z0-9_-]{11}$/.test(mediaKey)) return fail(c, 400, 'VALIDATION_ERROR', 'The YouTube playback key is invalid.');
  if (mediaType === 'anime' && !/^.{1,220}:\d{1,6}$/.test(mediaKey)) return fail(c, 400, 'VALIDATION_ERROR', 'The Anime playback key is invalid.');
  const artworkValue = typeof item.artworkUrl === 'string' ? item.artworkUrl : '';
  let artworkUrl: string | null = null;
  if (artworkValue && artworkValue.length <= 2048) {
    try { const parsed = new URL(artworkValue); if (parsed.protocol === 'https:') artworkUrl = parsed.toString(); } catch { /* optional artwork */ }
  }
  const rawState = item.playerState && typeof item.playerState === 'object' && !Array.isArray(item.playerState)
    ? item.playerState as Record<string, unknown> : {};
  const playerState: Record<string, string | number | boolean> = {};
  if (typeof rawState.volume === 'number' && Number.isFinite(rawState.volume)) playerState.volume = Math.max(0, Math.min(1, rawState.volume));
  if (typeof rawState.muted === 'boolean') playerState.muted = rawState.muted;
  if (typeof rawState.playbackRate === 'number' && Number.isFinite(rawState.playbackRate)) playerState.playbackRate = Math.max(0.25, Math.min(2, rawState.playbackRate));
  if (typeof rawState.quality === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(rawState.quality)) playerState.quality = rawState.quality;
  if (typeof rawState.subtitleLanguage === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(rawState.subtitleLanguage)) playerState.subtitleLanguage = rawState.subtitleLanguage;
  if (typeof rawState.sourceId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(rawState.sourceId)) playerState.sourceId = rawState.sourceId;
  const now = Date.now();
  const updatedAt = now;
  const progressSeconds = duration === null ? Math.min(86400, progress) : Math.min(duration, progress);
  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO user_media_playback
        (user_id, media_type, media_key, title, artwork_url, duration_seconds,
         progress_seconds, completed, player_state_json, updated_at, session_id, sequence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, media_type, media_key) DO UPDATE SET
        title=excluded.title, artwork_url=excluded.artwork_url, duration_seconds=excluded.duration_seconds,
        progress_seconds=excluded.progress_seconds, completed=excluded.completed,
        player_state_json=excluded.player_state_json, updated_at=excluded.updated_at,
        session_id=excluded.session_id, sequence=excluded.sequence
      WHERE user_media_playback.session_id IS NULL
         OR (excluded.session_id = user_media_playback.session_id AND excluded.sequence > user_media_playback.sequence)
         OR (excluded.session_id <> user_media_playback.session_id AND excluded.updated_at >= user_media_playback.updated_at)
    `).bind(user.id, mediaType, mediaKey, title, artworkUrl, duration, progressSeconds,
      item.completed === true ? 1 : 0, JSON.stringify(playerState), updatedAt, syncSessionId, syncSequence).run();
    const saved = Number(result.meta.changes ?? 0) > 0;
    return ok(c, { saved, stale: !saved, updatedAt });
  } catch (error) {
    logError(c, 'media_playback_sync_failed', error);
    return fail(c, 503, 'PLAYBACK_UNAVAILABLE', 'Could not sync playback progress.');
  }
});

app.get('/api/v1/me/history/sync', async (c) => {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to restore watch history.');
  const slug = c.req.query('slug');
  const episodeNumber = c.req.query('episodeNumber');
  try {
    const clearMarker = await c.env.DB.prepare(
      'SELECT cleared_at AS clearedAt FROM user_watch_history_clear_markers WHERE user_id = ?'
    ).bind(user.id).first<{ clearedAt: number }>();
    let result;
    if (slug && episodeNumber) {
      const [rows, tombstone] = await Promise.all([
        c.env.DB.prepare(`
          SELECT anime_slug AS slug, title, poster_url AS posterUrl,
                 episode_number AS episodeNumber, episode_title AS episodeTitle,
                 duration_seconds AS durationSeconds, progress_seconds AS progressSeconds,
                 updated_at AS updatedAt
          FROM user_watch_history
          WHERE user_id = ? AND anime_slug = ? AND episode_number = ?
          LIMIT 1
        `).bind(user.id, slug, Number(episodeNumber)).all(),
        c.env.DB.prepare(`
          SELECT deleted_at AS deletedAt FROM user_watch_history_tombstones
          WHERE user_id = ? AND anime_slug = ? AND episode_number = ?
        `).bind(user.id, slug, Number(episodeNumber)).first<{ deletedAt: number }>(),
      ]);
      result = rows;
      return ok(c, {
        items: result.results ?? [],
        deletedAt: Number(tombstone?.deletedAt ?? 0),
        clearedAt: Number(clearMarker?.clearedAt ?? 0),
      }, { count: result.results?.length ?? 0 });
    }
    result = await c.env.DB.prepare(`
      SELECT anime_slug AS slug, title, poster_url AS posterUrl,
             episode_number AS episodeNumber, episode_title AS episodeTitle,
             duration_seconds AS durationSeconds, progress_seconds AS progressSeconds,
             updated_at AS updatedAt
      FROM user_watch_history WHERE user_id = ?
      ORDER BY updated_at DESC LIMIT 100
    `).bind(user.id).all();
    return ok(c, { items: result.results ?? [], clearedAt: Number(clearMarker?.clearedAt ?? 0) }, { count: result.results?.length ?? 0 });
  } catch (error) {
    logError(c, 'watch_history_read_failed', error);
    return fail(c, 503, 'HISTORY_UNAVAILABLE', 'Watch history is temporarily unavailable.');
  }
});

app.post('/api/v1/me/history/sync', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) {
    return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
  }
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to sync watch history.');
  let body: unknown;
  try { body = await c.req.json(); } catch { return fail(c, 400, 'VALIDATION_ERROR', 'Provide valid JSON.'); }
  const request = body as { items?: unknown; deleted?: unknown; clear?: unknown } | null;
  const input = request?.items;
  const deleted = Array.isArray(request?.deleted) ? request.deleted : [];
  const clear = request?.clear === true;
  if (!Array.isArray(input) || input.length > 100 || deleted.length > 100 || input.length + deleted.length > 100) {
    return fail(c, 400, 'VALIDATION_ERROR', 'Watch history updates must contain at most 100 entries.');
  }
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  if (clear) {
    statements.push(c.env.DB.prepare(`
      INSERT INTO user_watch_history_tombstones (user_id, anime_slug, episode_number, deleted_at)
      SELECT user_id, anime_slug, episode_number, ? FROM user_watch_history WHERE user_id = ?
      ON CONFLICT(user_id, anime_slug, episode_number)
      DO UPDATE SET deleted_at = MAX(user_watch_history_tombstones.deleted_at, excluded.deleted_at)
    `).bind(now, user.id));
    statements.push(c.env.DB.prepare(`
      INSERT INTO user_watch_history_clear_markers (user_id, cleared_at) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET cleared_at = MAX(user_watch_history_clear_markers.cleared_at, excluded.cleared_at)
    `).bind(user.id, now));
    statements.push(c.env.DB.prepare('DELETE FROM user_watch_history WHERE user_id = ?').bind(user.id));
  }
  for (const value of input) {
    if (!value || typeof value !== 'object' || clear) continue;
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
    const timestamp = Math.floor(updatedAt);
    statements.push(c.env.DB.prepare(`
      INSERT INTO user_watch_history
        (user_id, anime_slug, episode_number, title, poster_url, episode_title,
         duration_seconds, progress_seconds, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ? > COALESCE((SELECT cleared_at FROM user_watch_history_clear_markers WHERE user_id = ?), -1)
        AND ? > COALESCE((SELECT deleted_at FROM user_watch_history_tombstones
                           WHERE user_id = ? AND anime_slug = ? AND episode_number = ?), -1)
      ON CONFLICT(user_id, anime_slug, episode_number) DO UPDATE SET
        title=excluded.title, poster_url=excluded.poster_url,
        episode_title=excluded.episode_title, duration_seconds=excluded.duration_seconds,
        progress_seconds=excluded.progress_seconds, updated_at=excluded.updated_at
      WHERE excluded.updated_at > user_watch_history.updated_at
    `).bind(user.id, slug, episodeNumber, title, posterUrl, episodeTitle,
      Number.isFinite(duration) && duration > 0 ? Math.min(86400, Math.floor(duration)) : null,
      Number.isFinite(progress) && progress >= 0 ? Math.min(86400, progress) : 0,
      timestamp, timestamp, user.id, timestamp, user.id, slug, episodeNumber));
  }
  if (!clear) {
    for (const value of deleted) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Record<string, unknown>;
      const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
      const episodeNumber = Number(item.episodeNumber);
      if (!slug || slug.length > 128 || !Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 100000) continue;
      statements.push(c.env.DB.prepare(`
        INSERT INTO user_watch_history_tombstones (user_id, anime_slug, episode_number, deleted_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, anime_slug, episode_number)
        DO UPDATE SET deleted_at = MAX(user_watch_history_tombstones.deleted_at, excluded.deleted_at)
      `).bind(user.id, slug, episodeNumber, now));
      statements.push(c.env.DB.prepare('DELETE FROM user_watch_history WHERE user_id = ? AND anime_slug = ? AND episode_number = ? AND updated_at <= ?').bind(user.id, slug, episodeNumber, now));
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

app.put('/api/v1/me/library/:animeId', async (c) => {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to update your Anime library.');
  const animeId = parseId(c.req.param('animeId'));
  if (!animeId) return fail(c, 400, 'VALIDATION_ERROR', 'The Anime identifier is invalid.');
  let body: unknown;
  try { body = await c.req.json(); } catch { return fail(c, 400, 'VALIDATION_ERROR', 'Provide valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(c, 400, 'VALIDATION_ERROR', 'Provide an Anime library entry.');
  const value = body as Record<string, unknown>;
  const statuses = ['watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped'] as const;
  const status = value.status;
  const isFavorite = value.isFavorite;
  if ((status !== null && !(statuses as readonly unknown[]).includes(status)) || typeof isFavorite !== 'boolean') {
    return fail(c, 400, 'VALIDATION_ERROR', 'The Anime library status or favorite flag is invalid.');
  }
  try {
    const anime = await c.env.DB.prepare('SELECT id FROM anime WHERE id = ? LIMIT 1').bind(animeId).first<{ id: string }>();
    if (!anime) return fail(c, 404, 'RESOURCE_NOT_FOUND', 'The requested Anime title was not found.');
    if (status === null && !isFavorite) {
      await c.env.DB.prepare('DELETE FROM user_library WHERE user_id = ? AND anime_id = ?').bind(user.id, animeId).run();
      return ok(c, { removed: true, animeId });
    }
    await c.env.DB.prepare(`
      INSERT INTO user_library (user_id, anime_id, status, is_favorite, added_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, anime_id) DO UPDATE SET
        status=excluded.status, is_favorite=excluded.is_favorite, updated_at=CURRENT_TIMESTAMP
    `).bind(user.id, animeId, status ?? 'plan_to_watch', isFavorite ? 1 : 0).run();
    return ok(c, { saved: true, animeId, status: status ?? 'plan_to_watch', isFavorite });
  } catch (error) {
    logError(c, 'anime_library_write_failed', error);
    return fail(c, 503, 'LIBRARY_UNAVAILABLE', 'Could not save this Anime title to your account.');
  }
});

app.delete('/api/v1/me/library/:animeId', async (c) => {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to update your Anime library.');
  const animeId = parseId(c.req.param('animeId'));
  if (!animeId) return fail(c, 400, 'VALIDATION_ERROR', 'The Anime identifier is invalid.');
  try {
    await c.env.DB.prepare('DELETE FROM user_library WHERE user_id = ? AND anime_id = ?').bind(user.id, animeId).run();
    return ok(c, { removed: true, animeId });
  } catch (error) {
    logError(c, 'anime_library_delete_failed', error);
    return fail(c, 503, 'LIBRARY_UNAVAILABLE', 'Could not remove this Anime title from your account.');
  }
});

app.get('/api/v1/me/movies/library', async (c) => {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to access your Movies library.');
  try {
    const result = await c.env.DB.prepare(`
      SELECT provider_id AS providerId, external_id AS externalId, status,
             is_favorite AS isFavorite, rating, added_at AS addedAt, updated_at AS updatedAt
      FROM user_movie_library_refs WHERE user_id = ?
      ORDER BY updated_at DESC LIMIT 200
    `).bind(user.id).all();
    return ok(c, { items: result.results ?? [] }, { count: result.results?.length ?? 0 });
  } catch (error) {
    logError(c, 'movie_library_read_failed', error);
    return fail(c, 503, 'MOVIE_LIBRARY_UNAVAILABLE', 'Your Movies library is temporarily unavailable.');
  }
});

app.post('/api/v1/me/movies/library', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) {
    return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
  }
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to sync your Movies library.');
  let body: unknown;
  try { body = await c.req.json(); } catch { return fail(c, 400, 'VALIDATION_ERROR', 'Provide valid JSON.'); }
  if (!body || typeof body !== 'object') return fail(c, 400, 'VALIDATION_ERROR', 'Provide a movie library entry.');
  const value = body as Record<string, unknown>;
  const providerId = typeof value.providerId === 'string' ? value.providerId.trim().toLowerCase() : '';
  const externalId = typeof value.externalId === 'string' ? value.externalId.trim() : '';
  const status = value.status === null || value.status === 'watchlist' || value.status === 'watched' ? value.status : undefined;
  const isFavorite = value.isFavorite;
  const rating = value.rating === null || value.rating === undefined ? null : Number(value.rating);
  if (providerId !== 'tmdb' || !/^\d{1,12}$/.test(externalId) ||
      status === undefined || typeof isFavorite !== 'boolean' ||
      (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 10))) {
    return fail(c, 400, 'VALIDATION_ERROR', 'The movie library entry is invalid.');
  }
  const now = Date.now();
  try {
    if (status === null && !isFavorite && rating === null) {
      await c.env.DB.prepare(
        'DELETE FROM user_movie_library_refs WHERE user_id = ? AND provider_id = ? AND external_id = ?'
      ).bind(user.id, providerId, externalId).run();
      return ok(c, { removed: true, providerId, externalId });
    }
    await c.env.DB.prepare(`
      INSERT INTO user_movie_library_refs
        (user_id, provider_id, external_id, status, is_favorite, rating, added_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider_id, external_id) DO UPDATE SET
        status=excluded.status, is_favorite=excluded.is_favorite,
        rating=excluded.rating, updated_at=excluded.updated_at
    `).bind(user.id, providerId, externalId, status, isFavorite ? 1 : 0, rating, now, now).run();
    return ok(c, { saved: true, providerId, externalId, status, isFavorite, rating, updatedAt: now });
  } catch (error) {
    logError(c, 'movie_library_write_failed', error);
    return fail(c, 503, 'MOVIE_LIBRARY_UNAVAILABLE', 'Could not save this movie to your account.');
  }
});

app.delete('/api/v1/me/movies/library/:providerId/:externalId', async (c) => {
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) {
    return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
  }
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to manage your Movies library.');
  const providerId = c.req.param('providerId').trim().toLowerCase();
  const externalId = c.req.param('externalId').trim();
  if (providerId !== 'tmdb' || !/^\d{1,12}$/.test(externalId)) {
    return fail(c, 400, 'VALIDATION_ERROR', 'The movie identifier is invalid.');
  }
  try {
    await c.env.DB.prepare(
      'DELETE FROM user_movie_library_refs WHERE user_id = ? AND provider_id = ? AND external_id = ?'
    ).bind(user.id, providerId, externalId).run();
    return ok(c, { removed: true });
  } catch (error) {
    logError(c, 'movie_library_delete_failed', error);
    return fail(c, 503, 'MOVIE_LIBRARY_UNAVAILABLE', 'Could not remove this movie from your account.');
  }
});

app.get('/api/v1/me/library', async (c) => {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined, c.get('accessSubject') as string | null | undefined);
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'A Kairo account session is required to access your library.');
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

app.notFound(async (c) => {
  if (isStaticAssetPath(c.req.path)) {
    try {
      const asset = await c.env.ASSETS?.fetch(c.req.raw);
      const contentType = asset?.headers.get('content-type')?.toLowerCase() ?? '';
      // With SPA fallback enabled Cloudflare may return index.html (200) for an
      // unknown .js/.css/image URL. Never let that HTML masquerade as an asset.
      if (asset && asset.status !== 404 && !contentType.startsWith('text/html')) return asset;
    } catch {
      // A missing/unavailable asset is still a 404; do not surface Worker internals.
    }
    return fail(c, 404, 'STATIC_ASSET_NOT_FOUND', 'The requested asset was not found.');
  }
  return fail(c, 404, 'RESOURCE_NOT_FOUND', 'The requested API route was not found.');
});
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

export default {
  fetch: (request: Request, env: Bindings, context: ExecutionContext) => app.fetch(request, env, context),
  // Expose Hono's in-process request helper for Worker integration tests only.
  request: app.request.bind(app),
  scheduled(_controller: ScheduledController, env: Bindings, context: ExecutionContext) {
    context.waitUntil(Promise.all([
      rotateAdminConsolePath(env.DB).catch((error) => {
        console.error(JSON.stringify({ event: 'admin_console_rotation_failed', message: error instanceof Error ? error.message : 'unknown' }));
      }),
      env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()),
        env.DB.prepare("DELETE FROM sessions WHERE COALESCE(last_used_at, created_at) < datetime('now', '-30 days')"),
        env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_started_at < ?').bind(Date.now() - 48 * 60 * 60 * 1000),
        env.DB.prepare('DELETE FROM youtube_oauth_states WHERE expires_at <= ? OR consumed_at IS NOT NULL').bind(Date.now()),
        env.DB.prepare('DELETE FROM google_oauth_states WHERE expires_at <= ? OR consumed_at IS NOT NULL').bind(Date.now()),
      ]).catch((error) => {
        console.error(JSON.stringify({ event: 'expired_auth_data_cleanup_failed', message: error instanceof Error ? error.message : 'unknown' }));
      }),
    ]));
  },
};
