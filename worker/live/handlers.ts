// Route handlers for the live catalogue. They return plain { status, body } objects so they can be tested without Hono;
// worker/index.ts wraps each one. Response shapes match docs/API_CONTRACT.md and what the React app already reads.
import { boundedInt, parseId, parsePagination, parseSearchParams, FORMATS, SEASONS, SORT_KEYS, STATUSES, type Result } from '../lib/validation';
import { ProviderError } from '../metadata/types';
import { validatePlaybackResult } from '../providers/playback';
import type { FetchLike } from '../metadata/providers/http';
import { parseRef } from './ids';
import * as svc from './service';
import type { BrowseQuery, LiveRequest, LiveResult, Paged } from './types';

export const isLiveMode = (v: string | undefined): boolean => (v ?? 'live').toLowerCase() !== 'db';

type Handler = (req: LiveRequest) => Promise<LiveResult>;
type Query = Record<string, string | undefined>;

const okBody = (req: LiveRequest, data: unknown, meta: Record<string, unknown> = {}): LiveResult => ({ status: 200, body: { success: true, data, meta: { requestId: req.requestId, ...meta } } });
const failBody = (req: LiveRequest, status: number, code: string, message: string): LiveResult => ({ status, body: { success: false, error: { code, message }, meta: { requestId: req.requestId } } });

const sourceMeta = (o: { via: string; degraded: boolean; stale: boolean }): Record<string, unknown> => ({ source: o.via, ...(o.degraded ? { degraded: true } : {}), ...(o.stale ? { stale: true } : {}) });

function providerFailure(req: LiveRequest, event: string, error: unknown): LiveResult {
  const kind = error instanceof ProviderError ? error.kind : 'unavailable';
  console.error(JSON.stringify({ event, requestId: req.requestId, kind, message: error instanceof Error ? error.message : 'unknown' }));
  if (kind === 'not_found') return failBody(req, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
  return failBody(req, 503, 'PROVIDER_UNAVAILABLE', 'The data providers are temporarily unavailable. Try again shortly.');
}

const pagedMeta = (p: Paged, page: number): Record<string, unknown> => ({ page, limit: p.limit, ...(p.total !== null ? { total: p.total } : {}), hasNextPage: p.hasNextPage });
const cards = (titles: Awaited<ReturnType<typeof svc.withArtwork>>) => titles.map((t) => t.card);
const artworkMeta = (deps: svc.Deps): Record<string, unknown> => ({ artworkProvider: deps.artworkProvider?.id ?? null });

export function currentSeason(d: Date): { season: 'winter' | 'spring' | 'summer' | 'fall'; year: number } {
  const m = d.getUTCMonth();
  return { season: m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall', year: d.getUTCFullYear() };
}

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[]): T | undefined | null {
  if (raw === undefined || raw === '') return undefined;
  const v = raw.toLowerCase() as T;
  return allowed.includes(v) ? v : null;
}

/** Filter-only browsing: like search, but the title text is optional. season=current means this calendar season. */
export function parseBrowse(q: Query, today: Date): Result<BrowseQuery> {
  const paging = parsePagination(q);
  if (!paging.ok) return paging;
  const sort = q.sort === undefined || q.sort === '' ? 'popularity' : (SORT_KEYS as readonly string[]).includes(q.sort) ? (q.sort as BrowseQuery['sort']) : null;
  if (sort === null) return { ok: false, message: `sort must be one of: ${SORT_KEYS.join(', ')}.` };
  const format = oneOf(q.format, FORMATS);
  const status = oneOf(q.status, STATUSES);
  const wantsCurrent = q.season?.toLowerCase() === 'current';
  const season = wantsCurrent ? undefined : oneOf(q.season, SEASONS);
  if (format === null || status === null || season === null) return { ok: false, message: 'Invalid format, status, or season filter.' };
  let year: number | undefined;
  if (q.year !== undefined && q.year !== '') {
    const y = boundedInt(q.year, 0, 1900, 2100);
    if (y === null) return { ok: false, message: 'year must be between 1900 and 2100.' };
    year = y;
  }
  let genre: string | undefined;
  if (q.genre !== undefined && q.genre !== '') {
    const g = q.genre.trim();
    if (g.length > 40 || !/^[\p{L}\p{N} &'-]+$/u.test(g)) return { ok: false, message: 'Invalid genre filter.' };
    genre = g;
  }
  const cur = wantsCurrent ? currentSeason(today) : null;
  return { ok: true, value: { sort, genre, year: cur?.year ?? year, format, status, season: cur?.season ?? season, page: paging.value.page, limit: paging.value.limit } };
}

export type LiveHandlers = Record<'featured' | 'trending' | 'latest' | 'search' | 'browse' | 'genres' | 'anime' | 'episodes' | 'related' | 'metadata' | 'servers' | 'playback' | 'providers' | 'ready', Handler>;

export function createLiveHandlers(fetchImpl: FetchLike, depsOverride?: (req: LiveRequest) => svc.Deps): LiveHandlers {
  const depsFor = (req: LiveRequest): svc.Deps =>
    depsOverride?.(req) ?? svc.buildDeps(req.env, fetchImpl, (source, error) => console.error(JSON.stringify({ event: 'provider_failed', source, kind: error.kind, requestId: req.requestId })));

  const listHandler = (kind: 'trending' | 'latest'): Handler => async (req) => {
    const paging = parsePagination(req.query);
    if (!paging.ok) return failBody(req, 400, 'VALIDATION_ERROR', paging.message);
    try {
      const deps = depsFor(req);
      const out = await svc.getList(deps, kind, paging.value.page, paging.value.limit);
      const items = cards(await svc.withArtwork(deps, out.value.items));
      return okBody(req, { items }, { ...pagedMeta(out.value, paging.value.page), ...sourceMeta(out), ...artworkMeta(deps) });
    } catch (e) { return providerFailure(req, `live_${kind}_failed`, e); }
  };

  const parseTitle = (req: LiveRequest) => {
    const raw = parseId(req.param('id'));
    return raw === null ? { bad: true as const } : { bad: false as const, ref: parseRef(raw) };
  };

  return {
    async featured(req) {
      try {
        const deps = depsFor(req);
        const out = await svc.getList(deps, 'featured', 1, 12);
        const items = cards(await svc.withArtwork(deps, out.value.items));
        return okBody(req, { items }, { count: out.value.items.length, ...sourceMeta(out), ...artworkMeta(deps) });
      } catch (e) { return providerFailure(req, 'live_featured_failed', e); }
    },
    trending: listHandler('trending'),
    latest: listHandler('latest'),

    async search(req) {
      const parsed = parseSearchParams(req.query);
      if (!parsed.ok) return failBody(req, 400, 'VALIDATION_ERROR', parsed.message);
      const { page, limit, q, sort, genre, year, format, status, season } = parsed.value;
      try {
        const deps = depsFor(req);
        const out = await svc.browse(deps, { q, sort, genre, year, format, status, season, page, limit });
        const items = cards(await svc.withArtwork(deps, out.value.items));
        return okBody(req, { items }, { ...pagedMeta(out.value, page), ...sourceMeta(out), ...artworkMeta(deps) });
      } catch (e) { return providerFailure(req, 'live_search_failed', e); }
    },

    async browse(req) {
      const parsed = parseBrowse(req.query, new Date());
      if (!parsed.ok) return failBody(req, 400, 'VALIDATION_ERROR', parsed.message);
      try {
        const deps = depsFor(req);
        const out = await svc.browse(deps, parsed.value);
        const items = cards(await svc.withArtwork(deps, out.value.items));
        return okBody(req, { items }, { ...pagedMeta(out.value, parsed.value.page), ...sourceMeta(out), ...artworkMeta(deps) });
      } catch (e) { return providerFailure(req, 'live_browse_failed', e); }
    },

    async genres(req) {
      try {
        const out = await svc.getGenres(depsFor(req));
        return okBody(req, { items: out.value }, sourceMeta(out));
      } catch (e) { return providerFailure(req, 'live_genres_failed', e); }
    },

    async anime(req) {
      const t = parseTitle(req);
      if (t.bad) return failBody(req, 400, 'VALIDATION_ERROR', 'Invalid anime identifier.');
      if (!t.ref) return failBody(req, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
      try {
        const deps = depsFor(req);
        const out = await svc.getTitle(deps, t.ref);
        const title = await svc.titleWithArtwork(deps, out.value);
        return okBody(req, { ...title.card, altTitles: title.altTitles }, { ...sourceMeta(out), ...artworkMeta(deps) });
      } catch (e) { return providerFailure(req, 'live_anime_failed', e); }
    },

    async episodes(req) {
      const t = parseTitle(req);
      const page = boundedInt(req.query.page, 1, 1, 500);
      if (t.bad || page === null) return failBody(req, 400, 'VALIDATION_ERROR', 'Invalid title or pagination values.');
      if (!t.ref) return failBody(req, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
      try {
        const deps = depsFor(req);
        const out = await svc.getEpisodes(deps, t.ref, page);
        const title = (await svc.getTitle(deps, t.ref)).value;
        const episodeRows = await svc.withEpisodeArtwork(deps, title, out.page.items);
        const animeId = `${t.ref.kind}${t.ref.id}`;
        const items = episodeRows.map((e) => ({ id: `${animeId}-e${e.episodeNumber}`, animeId, episodeNumber: e.episodeNumber, title: e.title, synopsis: e.synopsis, thumbnailUrl: e.thumbnailUrl ?? null, durationSeconds: e.durationSeconds, publishedAt: e.airedAt }));
        // The provider decides the page size, so the client's limit is ignored and page N maps straight to the provider's page N.
        return okBody(req, { items }, { page, limit: items.length, ...(out.page.total !== null ? { total: out.page.total } : {}), hasNextPage: out.page.hasNextPage, ...(out.via ? { ...sourceMeta({ via: out.via, degraded: out.degraded, stale: out.stale }), ...(out.cached ? { cached: true } : {}) } : {}) });
      } catch (e) { return providerFailure(req, 'live_episodes_failed', e); }
    },

    async servers(req) {
      const t = parseTitle(req);
      const rawEpisodeNumber = req.param('episodeNumber');
      const episodeNumber = rawEpisodeNumber === undefined ? null : boundedInt(rawEpisodeNumber, 1, 1, 100_000);
      if (t.bad || episodeNumber === null) return failBody(req, 400, 'VALIDATION_ERROR', 'Invalid title or episode number.');
      if (!t.ref) return failBody(req, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
      try {
        const out = await svc.getEpisodeServers(depsFor(req), t.ref, episodeNumber);
        return okBody(req, { items: out.items }, { source: out.via, episodeNumber });
      } catch (e) { return providerFailure(req, 'live_episode_servers_failed', e); }
    },

    async playback(req) {
      const t = parseTitle(req);
      const episodeNumber = boundedInt(req.param('episodeNumber'), 0, 1, 100_000);
      const serverId = req.query.serverId;
      if (t.bad || episodeNumber === null || !serverId || serverId.length > 1802 || !/^(?:\d{1,12}|h_[A-Za-z0-9_-]{1,1800})$/.test(serverId)) return failBody(req, 400, 'VALIDATION_ERROR', 'Invalid episode or playback server identifier.');
      if (!t.ref) return failBody(req, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
      try {
        const deps = depsFor(req);
        const raw = await svc.getEpisodePlayback(deps, t.ref, episodeNumber, serverId);
        const provider = deps.episodeProviders.find((item) => item.id === 'hianime');
        const allowedHosts = (req.env.HIANIME_PLAYBACK_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
        const checked = validatePlaybackResult(raw, { providerId: provider?.id ?? 'hianime', allowedHosts, now: new Date() });
        if (!checked.ok) return failBody(req, 503, 'SOURCE_UNAVAILABLE', 'No approved playback source is available for this server.');
        return okBody(req, checked.value, { source: provider?.id ?? 'hianime', episodeNumber });
      } catch (e) {
        if (e instanceof ProviderError && e.kind === 'not_found') return failBody(req, 404, 'RESOURCE_NOT_FOUND', 'The requested episode or server was not found.');
        return providerFailure(req, 'live_playback_failed', e);
      }
    },

    async related(req) {
      const t = parseTitle(req);
      const limit = boundedInt(req.query.limit, 12, 1, 24);
      if (t.bad || limit === null) return failBody(req, 400, 'VALIDATION_ERROR', 'Invalid title identifier or limit.');
      if (!t.ref) return failBody(req, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
      try {
        const deps = depsFor(req);
        const out = await svc.getRelated(deps, t.ref, limit);
        const titles = await svc.withArtwork(deps, out.value);
        return okBody(req, { items: titles.map((x) => x.card) }, { basis: out.via === 'anilist' ? 'relations_and_recommendations' : 'recommendations', limit, ...sourceMeta(out), ...artworkMeta(deps) });
      } catch (e) { return providerFailure(req, 'live_related_failed', e); }
    },

    async metadata(req) {
      const t = parseTitle(req);
      if (t.bad) return failBody(req, 400, 'VALIDATION_ERROR', 'Invalid anime identifier.');
      if (!t.ref) return failBody(req, 404, 'RESOURCE_NOT_FOUND', 'The requested title was not found.');
      try {
        const deps = depsFor(req);
        const out = await svc.getTitle(deps, t.ref);
        const title = await svc.titleWithArtwork(deps, out.value);
        const src = deps.sources.find((s) => s.id === out.via);
        const providers: { provider: string; state: string }[] = [{ provider: out.via, state: out.cached ? 'cached' : 'ok' }];
        if (out.primary !== out.via || out.stale) providers.push({ provider: out.primary, state: 'failed' });
        const tmdbArtworkUsed = [title.card.posterUrl, title.card.bannerUrl].some((url) => url?.startsWith('https://image.tmdb.org/'));
        return okBody(req, {
          title: title.card.title, synopsis: title.card.synopsis || null, rating: title.card.rating, episodeCount: title.card.episodeCount,
          genres: title.card.genres, posterUrl: title.card.posterUrl, bannerUrl: title.card.bannerUrl,
          ids: { ...(title.anilistId ? { anilist: String(title.anilistId) } : {}), ...(title.malId ? { mal: String(title.malId) } : {}) },
          sources: [...(src ? [{ providerId: src.id, displayName: src.attribution.displayName, text: src.attribution.text, url: title.url ?? src.attribution.url, license: src.attribution.license }] : []), ...(tmdbArtworkUsed ? [{ providerId: 'tmdb', displayName: 'TMDB', text: 'Artwork from The Movie Database. This product uses the TMDB API but is not endorsed or certified by TMDB.', url: 'https://www.themoviedb.org', license: null }] : [])],
          providers: [...providers, ...(tmdbArtworkUsed ? [{ provider: 'tmdb', state: 'ok' }] : [])],
        }, { degraded: out.degraded, basis: 'live', ...sourceMeta(out), ...artworkMeta(deps) });
      } catch (e) { return providerFailure(req, 'live_metadata_failed', e); }
    },

    async providers(req) {
      const deps = depsFor(req);
      return okBody(req, {
        items: deps.sources.map((s, i) => ({ id: s.id, displayName: s.displayName, enabled: true, priority: i + 1, maxPageSize: s.maxLimit, capabilities: { list: true, search: true, details: true, episodes: false }, attribution: s.attribution })),
        episodeProviders: deps.episodeProviders.map((p, i) => ({ id: p.id, displayName: p.displayName, enabled: true, priority: i + 1, termsVerified: p.termsVerified, capabilities: { episodes: true, servers: typeof p.listServers === 'function' } })),
        unknownConfigured: [],
        unknownEpisodeProviders: deps.unknownEpisodeProviders,
        artworkProvider: { id: 'tmdb', displayName: 'The Movie Database', enabled: Boolean(deps.artworkProvider) },
      });
    },

    // Readiness does not call the providers: that would spend their rate limits on every probe. It reports configuration only.
    async ready(req) {
      const deps = depsFor(req);
      return okBody(req, { status: 'ready', catalogSource: 'live', database: 'not used', cache: req.env.METADATA_CACHE ? 'kv' : 'none', providers: deps.sources.map((s) => s.id), episodeProviders: deps.episodeProviders.map((p) => p.id), artworkProvider: deps.artworkProvider?.id ?? null, unknownEpisodeProviders: deps.unknownEpisodeProviders });
    },
  };
}
