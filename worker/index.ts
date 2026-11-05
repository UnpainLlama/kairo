/// <reference types="@cloudflare/workers-types" />
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { boundedInt, parseId, parsePagination, parseSearchParams } from './lib/validation';
import { GENRES_SQL, buildListQuery, buildRelatedQuery, buildSearchQuery } from './repositories/catalog';

interface Bindings {
  DB: D1Database;
  APP_ENV?: string;
  ALLOWED_ORIGIN?: string;
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

app.get('/api/health', (c) => ok(c, { status: 'ok', service: 'kairo-api', environment: c.env.APP_ENV ?? 'unknown' }));

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
    return ok(c, { status: 'ready', database: 'ok' });
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

app.get('/api/v1/me', (c) => fail(c, 401, 'AUTH_REQUIRED', 'Sign in to access your profile.'));
app.get('/api/v1/me/library', (c) => fail(c, 401, 'AUTH_REQUIRED', 'Sign in to access your library.'));
app.get('/api/v1/episodes/:episodeId/playback', (c) => fail(c, 503, 'SOURCE_UNAVAILABLE', 'No authorized playback provider is configured.'));

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
