// Official MyAnimeList API v2 catalogue adapter.
// Public reads use the registered Client ID from a Worker secret; OAuth is not needed
// for catalogue reads. This source never handles user lists, episodes or playback.
import { httpsUrlOrNull, normalizeFormat, normalizeSeason, normalizeStatus, plainText, positiveInt, titleKey, uniqueStrings, yearOrNull } from '../metadata/normalize';
import { asString, isObject, providerFetch, readJson, USER_AGENT, type FetchLike } from '../metadata/providers/http';
import { ProviderError, type Attribution, type NormalizedMetadata } from '../metadata/types';
import { toLiveTitle } from './map';
import { Pacer } from './pacer';
import type { Ref } from './ids';
import type { BrowseQuery, CatalogSource, ListKind, LiveTitle, Paged } from './types';

const BASE = 'https://api.myanimelist.net/v2';
const HOST = 'api.myanimelist.net';
const PAGE_LIMIT = 100;
const SCAN_LIMIT = 500;
const LIST_FIELDS = 'alternative_titles,start_date,mean,rank,popularity,nsfw,media_type,status,num_episodes,start_season,genres,main_picture';
const DETAIL_FIELDS = LIST_FIELDS + ',end_date,synopsis,recommendations,studios';
const sharedPacer = new Pacer(1000);

export const MAL_ATTRIBUTION: Attribution = {
  providerId: 'mal',
  displayName: 'MyAnimeList',
  text: 'Anime catalogue metadata and artwork from MyAnimeList. KAIRO is an unofficial project and is not affiliated with MyAnimeList.',
  url: 'https://myanimelist.net',
  termsUrl: 'https://myanimelist.net/apiconfig/references/api/v2',
  license: null,
  requirements: [
    'Register a Client ID for this application and keep MAL_CLIENT_ID server-side as a Worker secret. Never expose it in browser JavaScript or share it with third parties.',
    'The official API does not publish a numeric request-rate limit; KAIRO paces requests conservatively and caches responses.',
    'Review and comply with the MyAnimeList API License and Developer Agreement, including any application notice/review requirements, before public release.',
    'Official API v2 exposes anime search, details, rankings and seasonal charts; it does not expose a standalone genre directory, complete episode feed, or video streams.',
  ],
};

const isSafeImage = (value: unknown): string | null => {
  const url = httpsUrlOrNull(value);
  if (!url) return null;
  try { return new URL(url).hostname === 'cdn.myanimelist.net' ? url : null; }
  catch { return null; }
};

const isAdult = (raw: Record<string, unknown>): boolean => {
  const nsfw = typeof raw.nsfw === 'string' ? raw.nsfw.toLowerCase() : '';
  const rating = typeof raw.rating === 'string' ? raw.rating.toLowerCase() : '';
  // The official API does not offer a dependable SFW query filter. Fail closed if grade is absent.
  return nsfw !== 'white' || rating === 'rx' || rating.startsWith('rx ');
};

function seasonYear(raw: unknown): number | null {
  if (!isObject(raw)) return null;
  return yearOrNull(raw.year);
}

export function mapMalAnime(raw: unknown, fetchedAt: string): NormalizedMetadata {
  if (!isObject(raw)) throw new ProviderError('invalid_response', 'MyAnimeList returned an unexpected anime object.');
  const id = positiveInt(raw.id);
  if (id === null) throw new ProviderError('invalid_response', 'MyAnimeList anime has no valid id.');
  const alternative = isObject(raw.alternative_titles) ? raw.alternative_titles : {};
  const start = isObject(raw.start_season) ? raw.start_season : {};
  const picture = isObject(raw.main_picture) ? raw.main_picture : {};
  const english = asString(alternative.en);
  const mainTitle = asString(raw.title);
  const japanese = asString(alternative.ja);
  const season = normalizeSeason(start.season);
  const fromDate = typeof raw.start_date === 'string' ? raw.start_date.slice(0, 4) : null;
  const year = seasonYear(start) ?? yearOrNull(fromDate);
  const genres = Array.isArray(raw.genres)
    ? raw.genres.flatMap((item) => isObject(item) && typeof item.name === 'string' && !/^(hentai|erotica)$/i.test(item.name.trim()) ? [item.name] : [])
    : [];
  const synonyms = Array.isArray(alternative.synonyms) ? alternative.synonyms : [];
  const score = typeof raw.mean === 'number' && Number.isFinite(raw.mean) && raw.mean > 0 && raw.mean <= 10
    ? Math.round(raw.mean * 10) / 10 : null;

  return {
    provider: 'mal',
    externalId: String(id),
    ids: { mal: String(id) },
    url: `https://myanimelist.net/anime/${id}`,
    title: english ?? mainTitle,
    titleEnglish: english,
    titleRomaji: mainTitle,
    titleNative: japanese,
    synonyms: uniqueStrings(synonyms),
    synopsis: plainText(raw.synopsis),
    format: normalizeFormat(raw.media_type),
    status: normalizeStatus(raw.status),
    season,
    year,
    episodeCount: positiveInt(raw.num_episodes),
    genres: uniqueStrings(genres),
    posterUrl: isSafeImage(picture.large) ?? isSafeImage(picture.medium),
    bannerUrl: null,
    rating: score,
    fetchedAt,
  };
}

type Row = { node: Record<string, unknown>; ranking?: Record<string, unknown> };
type ApiPage = { rows: Row[]; hasNextPage: boolean };

function unwrapRows(raw: unknown): Row[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const node = isObject(entry.node) ? entry.node : entry;
    if (!isObject(node)) return [];
    return [{ node, ...(isObject(entry.ranking) ? { ranking: entry.ranking } : {}) }];
  });
}

function matchesSearch(row: Row, query: string): boolean {
  const alt = isObject(row.node.alternative_titles) ? row.node.alternative_titles : {};
  const names = uniqueStrings([
    asString(row.node.title) ?? '',
    asString(alt.en) ?? '',
    asString(alt.ja) ?? '',
    ...(Array.isArray(alt.synonyms) ? alt.synonyms : []),
  ]);
  const q = titleKey(query);
  if (!q) return true;
  const tokens = q.split(' ').filter(Boolean);
  return names.some((name) => {
    const key = titleKey(name);
    return key.includes(q) || q.includes(key) || tokens.every((token) => key.split(' ').includes(token));
  });
}

function matchesFilters(row: Row, query: BrowseQuery): boolean {
  const meta = mapMalAnime(row.node, '1970-01-01T00:00:00.000Z');
  if (query.q && !matchesSearch(row, query.q)) return false;
  if (query.genre && !meta.genres.some((g) => g.toLowerCase() === query.genre?.toLowerCase())) return false;
  if (query.year !== undefined && meta.year !== query.year) return false;
  if (query.format && meta.format !== query.format) return false;
  if (query.status && meta.status !== query.status) return false;
  if (query.season && (meta.season !== query.season || meta.year !== query.year)) return false;
  return true;
}

function rowDate(row: Row): number {
  const raw = typeof row.node.start_date === 'string' ? Date.parse(row.node.start_date) : NaN;
  return Number.isFinite(raw) ? raw : 0;
}

export function createMalSource(
  fetchImpl: FetchLike,
  clientId: string | undefined,
  opts: { pacer?: Pacer; now?: () => string } = {},
): CatalogSource {
  const pacer = opts.pacer ?? sharedPacer;
  const now = opts.now ?? (() => new Date().toISOString());

  async function get(path: string, params: Record<string, string | number | boolean | undefined>, signal: AbortSignal): Promise<Record<string, unknown>> {
    if (!clientId?.trim()) throw new ProviderError('unavailable', 'MAL_CLIENT_ID is not configured on the Worker.');
    const url = new URL(`${BASE}${path}`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    await pacer.wait();
    const response = await providerFetch(fetchImpl, url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, 'X-MAL-CLIENT-ID': clientId.trim() },
      signal,
    }, HOST);
    if (response.status === 404) throw new ProviderError('not_found', 'MyAnimeList has no matching anime.');
    if (response.status === 400 || response.status === 422) throw new ProviderError('invalid_response', 'MyAnimeList rejected the catalogue request.');
    if (!response.ok) throw new ProviderError('unavailable', `MyAnimeList returned ${response.status}.`);
    const body = await readJson(response);
    if (!isObject(body)) throw new ProviderError('invalid_response', 'MyAnimeList returned an unexpected response body.');
    return body;
  }

  async function page(path: string, params: Record<string, string | number | boolean | undefined>, limit: number, offset: number, signal: AbortSignal): Promise<ApiPage> {
    const body = await get(path, { ...params, fields: params.fields ?? LIST_FIELDS, limit, offset }, signal);
    if (!Array.isArray(body.data)) throw new ProviderError('invalid_response', 'MyAnimeList returned no anime data array.');
    const paging = isObject(body.paging) ? body.paging : {};
    return { rows: unwrapRows(body.data), hasNextPage: typeof paging.next === 'string' && paging.next.length > 0 };
  }

  // MAL allows 500 rows for ranking/season endpoints and 100 for search.
  // Never follow paging.next directly; construct every request on the fixed API host.
  async function window(path: string, params: Record<string, string | number | boolean | undefined>, signal: AbortSignal): Promise<{ rows: Row[]; hasMore: boolean }> {
    const limit = path === '/anime' ? PAGE_LIMIT : SCAN_LIMIT;
    const result = await page(path, params, limit, 0, signal);
    const rows = [...result.rows];
    let hasMore = result.hasNextPage;
    if (path === '/anime') {
      for (let offset = PAGE_LIMIT; offset < SCAN_LIMIT && hasMore; offset += PAGE_LIMIT) {
        const next = await page(path, params, PAGE_LIMIT, offset, signal);
        rows.push(...next.rows);
        hasMore = next.hasNextPage;
        if (next.rows.length === 0) break;
      }
    }
    return { rows, hasMore };
  }

  const mapRows = (rows: Row[]): LiveTitle[] => {
    const seen = new Set<number>();
    const mapped: LiveTitle[] = [];
    for (const row of rows) {
      if (isAdult(row.node)) continue;
      try {
        const title = toLiveTitle(mapMalAnime(row.node, now()), 'mal');
        const id = Number(title.malId);
        if (seen.has(id)) continue;
        seen.add(id);
        mapped.push(title);
      } catch { /* Skip one malformed item without failing an otherwise valid page. */ }
    }
    return mapped;
  };

  const ranked = (sort: BrowseQuery['sort'], status?: BrowseQuery['status'], format?: BrowseQuery['format']): { path: string; params: Record<string, string | number | boolean | undefined> } => {
    let rankingType = sort === 'rating' ? 'all' : 'bypopularity';
    if (status === 'airing') rankingType = 'airing';
    else if (status === 'upcoming') rankingType = 'upcoming';
    else if (format === 'movie') rankingType = 'movie';
    else if (format === 'ova') rankingType = 'ova';
    else if (format === 'special') rankingType = 'special';
    else if (format === 'series') rankingType = 'tv';
    return { path: '/anime/ranking', params: { ranking_type: rankingType } };
  };

  async function collectedBrowse(q: BrowseQuery, signal: AbortSignal): Promise<Paged> {
    if (q.status === 'hiatus' || ((q.q?.trim().length ?? 0) > 0 && (q.q?.trim().length ?? 0) < 3)) return { items: [], total: 0, hasNextPage: false, limit: q.limit };
    let path = '/anime/ranking';
    let params: Record<string, string | number | boolean | undefined> = ranked(q.sort, q.status, q.format).params;
    if (q.q?.trim()) {
      path = '/anime';
      params = { q: q.q.trim().slice(0, 64) };
    } else if (q.season && q.year !== undefined) {
      path = `/anime/season/${q.year}/${q.season}`;
      params = { sort: q.sort === 'rating' ? 'anime_score' : 'anime_num_list_users' };
    } else if (q.sort === 'latest') {
      // MAL has no updates feed; use a bounded airing catalogue window and order by start date.
      path = '/anime/ranking';
      params = { ranking_type: 'airing' };
    }

    const needsScan = Boolean(q.q || q.genre || q.year !== undefined || q.season || q.format || q.status || q.sort === 'latest');
    const offset = (q.page - 1) * q.limit;
    if (!needsScan) {
      const limit = Math.min(Math.max(q.limit, 1), PAGE_LIMIT);
      const result = await page(path, params, limit, offset, signal);
      const titles = mapRows(result.rows);
      return { items: titles, total: null, hasNextPage: result.hasNextPage, limit };
    }

    const collected = await window(path, params, signal);
    let rows = collected.rows.filter((row) => !isAdult(row.node) && matchesFilters(row, q));
    if (q.sort === 'latest') rows = [...rows].sort((a, b) => rowDate(b) - rowDate(a));
    else if (q.sort === 'rating') rows = [...rows].sort((a, b) => Number(b.node.mean ?? 0) - Number(a.node.mean ?? 0));
    const filtered = mapRows(rows);
    const items = filtered.slice(offset, offset + q.limit);
    const moreInWindow = offset + q.limit < filtered.length;
    const hasNextPage = moreInWindow || collected.hasMore;
    return { items, total: collected.hasMore ? null : filtered.length, hasNextPage, limit: q.limit };
  }

  return {
    id: 'mal',
    displayName: 'MyAnimeList',
    attribution: MAL_ATTRIBUTION,
    maxLimit: PAGE_LIMIT,
    supports: (ref: Ref) => ref.kind === 'm',

    async list(kind: ListKind, pageNo, limit, signal) {
      const n = Math.min(Math.max(limit, 1), PAGE_LIMIT);
      const offset = (pageNo - 1) * n;
      if (kind === 'latest') {
        const date = new Date();
        const season = date.getUTCMonth() <= 2 ? 'winter' : date.getUTCMonth() <= 5 ? 'spring' : date.getUTCMonth() <= 8 ? 'summer' : 'fall';
        const body = await window(`/anime/season/${date.getUTCFullYear()}/${season}`, { sort: 'anime_num_list_users' }, signal);
        const rows = [...body.rows].sort((a, b) => rowDate(b) - rowDate(a));
        const mapped = mapRows(rows);
        return { items: mapped.slice(offset, offset + n), total: body.hasMore ? null : mapped.length, hasNextPage: offset + n < mapped.length || body.hasMore, limit: n };
      }
      const rankingType = kind === 'featured' ? 'airing' : 'bypopularity';
      const result = await page('/anime/ranking', { ranking_type: rankingType }, n, offset, signal);
      return { items: mapRows(result.rows), total: null, hasNextPage: result.hasNextPage, limit: n };
    },

    browse: collectedBrowse,

    async genres(signal) {
      const result = await window('/anime/ranking', { ranking_type: 'all' }, signal);
      const counts = new Map<string, number>();
      for (const row of result.rows) {
        if (isAdult(row.node) || !Array.isArray(row.node.genres)) continue;
        for (const item of row.node.genres) {
          if (!isObject(item) || typeof item.name !== 'string' || /^(hentai|erotica)$/i.test(item.name.trim())) continue;
          counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
        }
      }
      return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
    },

    async byRef(ref, signal) {
      if (ref.kind !== 'm') throw new ProviderError('not_found', 'MyAnimeList only resolves MyAnimeList ids.');
      const body = await get(`/anime/${ref.id}`, { fields: DETAIL_FIELDS }, signal);
      const value = isObject(body.data) ? body.data : body;
      if (!isObject(value) || isAdult(value)) throw new ProviderError('not_found', 'MyAnimeList has no matching anime.');
      return toLiveTitle(mapMalAnime(value, now()), 'mal');
    },

    async related(ref, limit, signal) {
      if (ref.kind !== 'm') throw new ProviderError('not_found', 'MyAnimeList only resolves MyAnimeList ids.');
      const body = await get(`/anime/${ref.id}`, { fields: DETAIL_FIELDS, nsfw: false }, signal);
      const value = isObject(body.data) ? body.data : body;
      if (!isObject(value) || isAdult(value)) throw new ProviderError('not_found', 'MyAnimeList has no matching anime.');
      const recommendations = Array.isArray(value.recommendations) ? value.recommendations : [];
      return mapRows(recommendations.flatMap((item) => isObject(item) && isObject(item.node) ? [{ node: item.node }] : [])).slice(0, limit);
    },
  };
}
