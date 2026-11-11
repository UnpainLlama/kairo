// Live Jikan catalogue source (REST, https://api.jikan.moe/v4, unofficial MyAnimeList API, no key).
// Documented limits: 3 requests/second and 60/minute, 24-hour server cache. Jikan scrapes MyAnimeList, so it can answer 504 on a cache miss.
// It is therefore the FALLBACK for catalogue lists and search. Its episode-list adapter lives separately in worker/episodes/providers/jikan.ts. It has no banner images.
// NOTE: Jikan's own terms policy has not been read by the owner yet. Do that before launch (see docs/LIVE_CATALOGUE.md).
// Field names below follow the v4 docs from memory and are untested against live responses; every field is read defensively.
import { httpsUrlOrNull, normalizeFormat, normalizeSeason, plainText, positiveInt, uniqueStrings, yearOrNull } from '../metadata/normalize';
import { asString, isObject, providerFetch, readJson, USER_AGENT, type FetchLike } from '../metadata/providers/http';
import { ProviderError, type Attribution, type NormalizedMetadata, type Status } from '../metadata/types';
import { toLiveTitle } from './map';
import type { Ref } from './ids';
import type { BrowseQuery, CatalogSource, ListKind, LiveTitle, Paged } from './types';

const BASE = 'https://api.jikan.moe/v4';
const HOST = 'api.jikan.moe';
const MAX_LIMIT = 25;

export const JIKAN_ATTRIBUTION: Attribution = {
  providerId: 'jikan',
  displayName: 'Jikan (MyAnimeList)',
  text: 'Details from MyAnimeList via the Jikan API. KAIRO is an unofficial, personal project and is not affiliated with MyAnimeList or Jikan.',
  url: 'https://jikan.moe',
  termsUrl: 'https://docs.api.jikan.moe',
  license: null,
  requirements: [
    'Rate limits: 3 requests per second and 60 per minute. MyAnimeList can also rate-limit Jikan separately.',
    'Responses are cached for 24 hours by Jikan. Uncached requests can fail with 504 when MyAnimeList is unreachable.',
    'Owner action: read Jikan\'s terms of use policy before launch. It has not been read yet.',
  ],
};

/** Spaces request starts so a burst from one Worker isolate stays under 3/second. Reserves its slot synchronously. */
export class Pacer {
  private next = 0;
  constructor(
    private gapMs: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  async wait(): Promise<void> {
    const t = this.now();
    const start = Math.max(t, this.next);
    this.next = start + this.gapMs;
    if (start > t) await this.sleep(start - t);
  }
}
const sharedPacer = new Pacer(400);

/** Shared by catalogue and episode adapters so combined Jikan traffic observes one per-isolate pace. */
export const waitForJikanSlot = (): Promise<void> => sharedPacer.wait();

const TYPES = { series: 'tv', movie: 'movie', ova: 'ova', ona: 'ona', special: 'special' } as const;
const STATUS = { airing: 'airing', finished: 'complete', upcoming: 'upcoming' } as const;
const SEASON_RANGE = { winter: ['01-01', '03-31'], spring: ['04-01', '06-30'], summer: ['07-01', '09-30'], fall: ['10-01', '12-31'] } as const;

function jikanStatus(raw: unknown): Status | null {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s.includes('currently')) return 'airing';
  if (s.includes('finished')) return 'finished';
  if (s.includes('not yet')) return 'upcoming';
  return null;
}

const isAdult = (raw: Record<string, unknown>): boolean => typeof raw.rating === 'string' && /^rx\b/i.test(raw.rating.trim());

export function mapJikanAnime(raw: unknown, fetchedAt: string): NormalizedMetadata {
  if (!isObject(raw)) throw new ProviderError('invalid_response', 'Jikan returned an unexpected anime shape.');
  const id = positiveInt(raw.mal_id);
  if (id === null) throw new ProviderError('invalid_response', 'Jikan anime has no valid mal_id.');
  const jpg = isObject(raw.images) && isObject(raw.images.jpg) ? raw.images.jpg : {};
  const aired = isObject(raw.aired) && isObject(raw.aired.prop) && isObject(raw.aired.prop.from) ? raw.aired.prop.from : {};
  const english = asString(raw.title_english);
  const romaji = asString(raw.title);
  const score = typeof raw.score === 'number' && raw.score > 0 && raw.score <= 10 ? Math.round(raw.score * 10) / 10 : null;
  const genres = Array.isArray(raw.genres) ? raw.genres.map((g) => (isObject(g) ? g.name : null)) : [];
  const synopsis = typeof raw.synopsis === 'string' ? raw.synopsis.replace(/\s*\[Written by MAL Rewrite\]\s*$/i, '') : null;
  return {
    provider: 'jikan',
    externalId: String(id),
    ids: { mal: String(id) },
    url: httpsUrlOrNull(raw.url),
    title: english ?? romaji,
    titleEnglish: english,
    titleRomaji: romaji,
    titleNative: asString(raw.title_japanese),
    synonyms: uniqueStrings(Array.isArray(raw.title_synonyms) ? raw.title_synonyms : []),
    synopsis: plainText(synopsis),
    format: normalizeFormat(raw.type),
    status: jikanStatus(raw.status),
    season: normalizeSeason(raw.season),
    year: yearOrNull(raw.year) ?? yearOrNull(aired.year),
    episodeCount: positiveInt(raw.episodes),
    genres: uniqueStrings(genres),
    posterUrl: httpsUrlOrNull(jpg.large_image_url) ?? httpsUrlOrNull(jpg.image_url),
    bannerUrl: null,
    rating: score,
    fetchedAt,
  };
}

/** Recommendation entries only carry id, title and image, so the rest stays null. */
function mapRecommendationEntry(entry: unknown, fetchedAt: string): NormalizedMetadata {
  if (!isObject(entry)) throw new ProviderError('invalid_response', 'Unexpected recommendation entry.');
  return mapJikanAnime({ mal_id: entry.mal_id, title: entry.title, url: entry.url, images: entry.images }, fetchedAt);
}

type Genre = { id: number; name: string; count: number };

export function createJikanSource(fetchImpl: FetchLike, opts: { pacer?: Pacer; now?: () => string; clock?: () => number } = {}): CatalogSource {
  const pacer = opts.pacer ?? sharedPacer;
  const now = opts.now ?? (() => new Date().toISOString());
  const clock = opts.clock ?? Date.now;
  let genreMemo: { at: number; value: Genre[] } | null = null;

  async function get(path: string, params: Record<string, string | number | boolean | undefined>, signal: AbortSignal): Promise<Record<string, unknown>> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    await pacer.wait();
    const res = await providerFetch(fetchImpl, url.toString(), { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal }, HOST);
    if (res.status === 404) throw new ProviderError('not_found', 'Jikan has no matching title.');
    if (res.status === 400 || res.status === 422) throw new ProviderError('invalid_response', 'Jikan rejected the request.');
    if (!res.ok) throw new ProviderError('unavailable', `Jikan returned ${res.status}.`);
    const body = await readJson(res);
    if (!isObject(body)) throw new ProviderError('invalid_response', 'Jikan returned an unexpected body.');
    return body;
  }

  function mapMany(raw: unknown): LiveTitle[] {
    const at = now();
    const out: LiveTitle[] = [];
    const seen = new Set<number>();
    for (const m of Array.isArray(raw) ? raw : []) {
      if (!isObject(m) || isAdult(m)) continue;
      try {
        const meta = mapJikanAnime(m, at);
        const id = Number(meta.externalId);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(toLiveTitle(meta, 'jikan'));
      } catch { /* skip */ }
    }
    return out;
  }

  function toPaged(body: Record<string, unknown>, limit: number): Paged {
    if (!Array.isArray(body.data)) throw new ProviderError('invalid_response', 'Jikan returned no data array.');
    const pg = isObject(body.pagination) ? body.pagination : {};
    const items = isObject(pg.items) ? pg.items : {};
    const total = typeof items.total === 'number' && items.total >= 0 ? items.total : null;
    return { items: mapMany(body.data), total, hasNextPage: pg.has_next_page === true, limit };
  }

  async function genreTable(signal: AbortSignal): Promise<Genre[]> {
    if (genreMemo && clock() - genreMemo.at < 3_600_000) return genreMemo.value;
    const body = await get('/genres/anime', { filter: 'genres' }, signal);
    if (!Array.isArray(body.data)) throw new ProviderError('invalid_response', 'Jikan returned no genre list.');
    const value: Genre[] = [];
    for (const g of body.data) {
      if (!isObject(g)) continue;
      const id = positiveInt(g.mal_id);
      const name = asString(g.name);
      if (id === null || name === null || /^(hentai|erotica)$/i.test(name)) continue;
      value.push({ id, name, count: typeof g.count === 'number' && g.count >= 0 ? g.count : 0 });
    }
    genreMemo = { at: clock(), value };
    return value;
  }

  const empty = (limit: number): Paged => ({ items: [], total: 0, hasNextPage: false, limit });

  return {
    id: 'jikan',
    displayName: 'Jikan (MyAnimeList)',
    attribution: JIKAN_ATTRIBUTION,
    maxLimit: MAX_LIMIT,
    supports: (ref: Ref) => ref.kind === 'm',

    async list(kind: ListKind, page, limit, signal) {
      const n = Math.min(Math.max(limit, 1), MAX_LIMIT);
      if (kind === 'featured') return toPaged(await get('/top/anime', { filter: 'airing', sfw: true, page: 1, limit: Math.min(n, 12) }, signal), Math.min(n, 12));
      if (kind === 'trending') return toPaged(await get('/seasons/now', { sfw: true, page, limit: n }, signal), n);
      return toPaged(await get('/anime', { status: 'airing', order_by: 'start_date', sort: 'desc', sfw: true, page, limit: n }, signal), n);
    },

    async browse(q: BrowseQuery, signal) {
      const n = Math.min(Math.max(q.limit, 1), MAX_LIMIT);
      // Jikan has no "on hiatus" status. Returning nothing is honest; returning unfiltered results would be wrong.
      if (q.status === 'hiatus') return empty(n);
      const params: Record<string, string | number | boolean | undefined> = { sfw: true, page: q.page, limit: n };
      const text = q.q?.trim();
      if (text) params.q = text.slice(0, 100);
      if (q.format) params.type = TYPES[q.format];
      if (q.status) params.status = STATUS[q.status];
      if (q.genre) {
        const g = (await genreTable(signal)).find((x) => x.name.toLowerCase() === q.genre?.toLowerCase());
        if (!g) return empty(n);
        params.genres = g.id;
      }
      if (q.season && !text && !q.genre && !q.status && ['popularity', 'trending', 'relevance'].includes(q.sort)) {
        // Use Jikan's native seasonal archive rather than approximating a season with calendar dates.
        // The endpoint supports a format filter but not search, genre, status, or arbitrary sort filters;
        // those combinations intentionally retain the /anime date-range path below.
        const year = q.year ?? new Date(clock()).getUTCFullYear();
        const filter = q.format ? TYPES[q.format] : undefined;
        return toPaged(await get(`/seasons/${year}/${q.season}`, { filter, sfw: true, page: q.page, limit: n }, signal), n);
      }
      if (q.season || q.year !== undefined) {
        const year = q.year ?? new Date(clock()).getUTCFullYear();
        const [from, to] = q.season ? SEASON_RANGE[q.season] : (['01-01', '12-31'] as const);
        params.start_date = `${year}-${from}`;
        params.end_date = `${year}-${to}`;
      }
      if (q.sort === 'popularity' || q.sort === 'trending' || (q.sort === 'relevance' && !text)) { params.order_by = 'popularity'; params.sort = 'asc'; }
      else if (q.sort === 'latest') { params.order_by = 'start_date'; params.sort = 'desc'; }
      else if (q.sort === 'rating') { params.order_by = 'score'; params.sort = 'desc'; }
      return toPaged(await get('/anime', params, signal), n);
    },

    async genres(signal) {
      return (await genreTable(signal)).map(({ name, count }) => ({ name, count }));
    },

    async byRef(ref, signal) {
      if (ref.kind !== 'm') throw new ProviderError('not_found', 'Jikan only knows MyAnimeList ids.');
      const body = await get(`/anime/${ref.id}`, {}, signal);
      if (!isObject(body.data) || isAdult(body.data)) throw new ProviderError('not_found', 'Jikan has no matching title.');
      return toLiveTitle(mapJikanAnime(body.data, now()), 'jikan');
    },

    async related(ref, limit, signal) {
      if (ref.kind !== 'm') throw new ProviderError('not_found', 'Jikan only knows MyAnimeList ids.');
      const body = await get(`/anime/${ref.id}/recommendations`, {}, signal);
      if (!Array.isArray(body.data)) throw new ProviderError('invalid_response', 'Jikan returned no recommendations array.');
      const at = now();
      const out: LiveTitle[] = [];
      for (const r of body.data) {
        if (!isObject(r)) continue;
        try { out.push(toLiveTitle(mapRecommendationEntry(r.entry, at), 'jikan')); } catch { /* skip */ }
        if (out.length >= limit) break;
      }
      return out;
    },

  };
}
