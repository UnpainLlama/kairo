// Official MyAnimeList API v2 catalogue adapter.
// Catalogue identity and descriptive metadata come from MAL; all displayed imagery is resolved separately by TMDB.
import { normalizeSeason, plainText, positiveInt, titleKey, uniqueStrings, yearOrNull } from '../metadata/normalize';
import { asString, isObject, providerFetch, readJson, USER_AGENT, type FetchLike } from '../metadata/providers/http';
import { ProviderError, type Attribution, type NormalizedMetadata } from '../metadata/types';
import { toLiveTitle } from './map';
import type { Ref } from './ids';
import type { BrowseQuery, CatalogSource, ListKind, LiveTitle, Paged } from './types';

const BASE = 'https://api.myanimelist.net/v2';
const HOST = 'api.myanimelist.net';
const SEARCH_LIMIT = 100;
const RANKING_LIMIT = 500;
const FIELDS = 'alternative_titles{en,ja,synonyms},start_date,synopsis,mean,rank,popularity,nsfw,rating,media_type,status,num_episodes,start_season{year,season},genres';
const DETAIL_FIELDS = FIELDS + ',end_date,recommendations{node{id,title,nsfw,rating,media_type,status,num_episodes,start_date,start_season{year,season},mean,genres,alternative_titles{en,ja,synonyms}}}';

export const MAL_ATTRIBUTION: Attribution = {
  providerId: 'mal',
  displayName: 'MyAnimeList',
  text: 'Anime catalogue metadata from MyAnimeList. KAIRO is an independent project and is not affiliated with MyAnimeList. All anime artwork is sourced separately from TMDB.',
  url: 'https://myanimelist.net',
  termsUrl: 'https://myanimelist.net/apiconfig/references/api/v2',
  license: null,
  requirements: [
    'Register a MyAnimeList API Client ID and store it as the server-side MAL_CLIENT_ID Worker secret.',
    'Do not expose the Client ID in browser code, public configuration or client responses.',
    'Review and comply with the MyAnimeList API License and Developer Agreement before public release.',
    'The API provides catalogue metadata and recommendations, not episode listings, playable media or artwork for KAIRO.',
    'KAIRO uses TMDB as its exclusive source for anime posters, backdrops, banners and episode stills.',
  ],
};

type Row = { node: Record<string, unknown> };
type PageResult = { rows: Row[]; hasNextPage: boolean };

const isAdult = (raw: Record<string, unknown>): boolean => {
  const nsfw = typeof raw.nsfw === 'string' ? raw.nsfw.toLowerCase() : '';
  const rating = typeof raw.rating === 'string' ? raw.rating.toLowerCase() : '';
  return nsfw !== 'white' || rating === 'rx' || rating.startsWith('rx ');
};

function mapFormat(raw: unknown): NormalizedMetadata['format'] {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value === 'tv' || value === 'tv_short') return 'series';
  if (value === 'movie') return 'movie';
  if (value === 'ova') return 'ova';
  if (value === 'ona') return 'ona';
  if (value === 'special') return 'special';
  return null;
}

function mapStatus(raw: unknown): NormalizedMetadata['status'] {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value === 'currently_airing') return 'airing';
  if (value === 'finished_airing') return 'finished';
  if (value === 'not_yet_aired') return 'upcoming';
  return null;
}

export function mapMalAnime(raw: unknown, fetchedAt: string): NormalizedMetadata {
  if (!isObject(raw)) throw new ProviderError('invalid_response', 'MyAnimeList returned an invalid anime record.');
  const id = positiveInt(raw.id);
  if (id === null) throw new ProviderError('invalid_response', 'MyAnimeList returned an anime without a valid id.');
  const titles = isObject(raw.alternative_titles) ? raw.alternative_titles : {};
  const mainTitle = asString(raw.title);
  const english = asString(titles.en);
  const japanese = asString(titles.ja);
  const startSeason = isObject(raw.start_season) ? raw.start_season : {};
  const startDate = typeof raw.start_date === 'string' ? raw.start_date : '';
  const genres = Array.isArray(raw.genres)
    ? raw.genres.flatMap((entry) => isObject(entry) && typeof entry.name === 'string' && !/^(hentai|erotica)$/i.test(entry.name.trim()) ? [entry.name.trim()] : [])
    : [];
  const synonyms = Array.isArray(titles.synonyms) ? titles.synonyms : [];
  const score = typeof raw.mean === 'number' && Number.isFinite(raw.mean) && raw.mean > 0 && raw.mean <= 10
    ? Math.round(raw.mean * 10) / 10 : null;
  const yearFromDate = yearOrNull(startDate.slice(0, 4));

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
    format: mapFormat(raw.media_type),
    status: mapStatus(raw.status),
    season: normalizeSeason(startSeason.season),
    year: yearOrNull(startSeason.year) ?? yearFromDate,
    episodeCount: positiveInt(raw.num_episodes),
    genres: uniqueStrings(genres),
    // Intentionally no provider artwork URLs: TMDB is the sole anime image source.
    posterUrl: null,
    bannerUrl: null,
    rating: score,
    fetchedAt,
  };
}

function unwrapRows(raw: unknown): Row[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const node = isObject(entry.node) ? entry.node : entry;
    return isObject(node) ? [{ node }] : [];
  });
}

function matchesTitle(row: Row, query: string): boolean {
  const alt = isObject(row.node.alternative_titles) ? row.node.alternative_titles : {};
  const names = uniqueStrings([
    asString(row.node.title) ?? '',
    asString(alt.en) ?? '',
    asString(alt.ja) ?? '',
    ...(Array.isArray(alt.synonyms) ? alt.synonyms : []),
  ]);
  const wanted = titleKey(query);
  const tokens = wanted.split(' ').filter(Boolean);
  return !wanted || names.some((name) => {
    const candidate = titleKey(name);
    return candidate.includes(wanted) || wanted.includes(candidate) || tokens.every((token) => candidate.split(' ').includes(token));
  });
}

function matchesFilters(row: Row, query: BrowseQuery, now: string): boolean {
  const meta = mapMalAnime(row.node, now);
  if (query.q && !matchesTitle(row, query.q)) return false;
  if (query.genre && !meta.genres.some((genre) => genre.toLowerCase() === query.genre!.toLowerCase())) return false;
  if (query.year !== undefined && meta.year !== query.year) return false;
  if (query.format && meta.format !== query.format) return false;
  if (query.status && meta.status !== query.status) return false;
  if (query.season && meta.season !== query.season) return false;
  return true;
}

function dateValue(row: Row): number {
  const value = typeof row.node.start_date === 'string' ? Date.parse(row.node.start_date) : NaN;
  return Number.isFinite(value) ? value : 0;
}

function seasonFor(date: Date): { year: number; season: 'winter' | 'spring' | 'summer' | 'fall' } {
  const month = date.getUTCMonth();
  return {
    year: date.getUTCFullYear(),
    season: month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'fall',
  };
}

class RequestPacer {
  private tail: Promise<void> = Promise.resolve();
  private nextAt = 0;
  constructor(private readonly gapMs = 1100) {}
  wait(): Promise<void> {
    const run = this.tail.then(async () => {
      const delay = Math.max(0, this.nextAt - Date.now());
      if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
      this.nextAt = Date.now() + this.gapMs;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}

const sharedPacer = new RequestPacer();

export function createMalSource(
  fetchImpl: FetchLike,
  clientId: string | undefined,
  options: { wait?: () => Promise<void>; now?: () => string } = {},
): CatalogSource {
  const wait = options.wait ?? (() => sharedPacer.wait());
  const now = options.now ?? (() => new Date().toISOString());

  async function request(path: string, params: Record<string, string | number | undefined>, signal: AbortSignal): Promise<Record<string, unknown>> {
    if (!clientId?.trim()) throw new ProviderError('unavailable', 'MAL_CLIENT_ID is not configured on the Worker.');
    const url = new URL(`${BASE}${path}`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    await wait();
    const response = await providerFetch(fetchImpl, url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, 'X-MAL-CLIENT-ID': clientId.trim() },
      signal,
      redirect: 'manual',
    }, HOST);
    if (response.status === 404) throw new ProviderError('not_found', 'MyAnimeList has no matching anime.');
    if (response.status === 400 || response.status === 422) throw new ProviderError('invalid_response', 'MyAnimeList rejected the catalogue request.');
    if (response.status === 401 || response.status === 403) throw new ProviderError('unavailable', 'MyAnimeList rejected the configured Client ID or API access.');
    if (!response.ok) throw new ProviderError('unavailable', `MyAnimeList returned HTTP ${response.status}.`);
    const body = await readJson(response);
    if (!isObject(body)) throw new ProviderError('invalid_response', 'MyAnimeList returned an unexpected response body.');
    return body;
  }

  async function page(path: string, params: Record<string, string | number | undefined>, limit: number, offset: number, signal: AbortSignal): Promise<PageResult> {
    const maximum = path === '/anime' ? SEARCH_LIMIT : RANKING_LIMIT;
    const size = Math.min(Math.max(limit, 1), maximum);
    const body = await request(path, { ...params, fields: params.fields ?? FIELDS, limit: size, offset }, signal);
    if (!Array.isArray(body.data)) throw new ProviderError('invalid_response', 'MyAnimeList returned no anime data array.');
    const paging = isObject(body.paging) ? body.paging : {};
    return { rows: unwrapRows(body.data), hasNextPage: typeof paging.next === 'string' && paging.next.length > 0 };
  }

  async function collect(path: string, params: Record<string, string | number | undefined>, signal: AbortSignal): Promise<PageResult> {
    const pageSize = path === '/anime' ? SEARCH_LIMIT : RANKING_LIMIT;
    const first = await page(path, params, pageSize, 0, signal);
    const rows = [...first.rows];
    let hasNextPage = first.hasNextPage;
    // Bounded search/filter scan: at most five requests for text search, one for rankings and seasons.
    if (path === '/anime') {
      for (let offset = SEARCH_LIMIT; offset < 500 && hasNextPage; offset += SEARCH_LIMIT) {
        const next = await page(path, params, SEARCH_LIMIT, offset, signal);
        rows.push(...next.rows);
        hasNextPage = next.hasNextPage;
        if (next.rows.length === 0) break;
      }
    }
    return { rows, hasNextPage };
  }

  const mapRows = (rows: Row[]): LiveTitle[] => {
    const seen = new Set<number>();
    const result: LiveTitle[] = [];
    for (const row of rows) {
      if (isAdult(row.node)) continue;
      try {
        const title = toLiveTitle(mapMalAnime(row.node, now()), 'mal');
        const id = Number(title.malId);
        if (Number.isSafeInteger(id) && !seen.has(id)) { seen.add(id); result.push(title); }
      } catch { /* Skip a malformed item without failing the page. */ }
    }
    return result;
  };

  function rankingFor(query: BrowseQuery): { path: string; params: Record<string, string | number | undefined> } {
    if (query.season) {
      const seasonYear = query.year ?? new Date(now()).getUTCFullYear();
      return { path: `/anime/season/${seasonYear}/${query.season}`, params: { sort: query.sort === 'rating' ? 'anime_score' : 'anime_num_list_users' } };
    }
    if (query.status === 'airing' || query.sort === 'latest') return { path: '/anime/ranking', params: { ranking_type: 'airing' } };
    if (query.status === 'upcoming') return { path: '/anime/ranking', params: { ranking_type: 'upcoming' } };
    if (query.format === 'movie') return { path: '/anime/ranking', params: { ranking_type: 'movie' } };
    if (query.format === 'ova') return { path: '/anime/ranking', params: { ranking_type: 'ova' } };
    if (query.format === 'special') return { path: '/anime/ranking', params: { ranking_type: 'special' } };
    if (query.format === 'series') return { path: '/anime/ranking', params: { ranking_type: 'tv' } };
    return { path: '/anime/ranking', params: { ranking_type: query.sort === 'rating' ? 'all' : 'bypopularity' } };
  }

  async function browse(query: BrowseQuery, signal: AbortSignal): Promise<Paged> {
    const text = query.q?.trim().slice(0, 100);
    if (text && text.length < 2) return { items: [], total: 0, hasNextPage: false, limit: query.limit };
    const source = text
      ? { path: '/anime', params: { q: text } }
      : rankingFor(query);
    const collected = await collect(source.path, source.params, signal);
    let rows = collected.rows.filter((row) => !isAdult(row.node) && matchesFilters(row, query, now()));
    if (query.sort === 'latest') rows = [...rows].sort((a, b) => dateValue(b) - dateValue(a));
    else if (query.sort === 'rating') rows = [...rows].sort((a, b) => Number(b.node.mean ?? 0) - Number(a.node.mean ?? 0));
    const offset = (query.page - 1) * query.limit;
    const items = mapRows(rows).slice(offset, offset + query.limit);
    return { items, total: collected.hasNextPage ? null : rows.length, hasNextPage: offset + query.limit < rows.length, limit: query.limit };
  }

  return {
    id: 'mal',
    displayName: 'MyAnimeList',
    attribution: MAL_ATTRIBUTION,
    maxLimit: SEARCH_LIMIT,
    supports: (ref: Ref) => ref.kind === 'm',

    async list(kind: ListKind, pageNo: number, limit: number, signal: AbortSignal): Promise<Paged> {
      const size = Math.min(Math.max(limit, 1), SEARCH_LIMIT);
      const offset = (pageNo - 1) * size;
      if (kind === 'latest') {
        const current = seasonFor(new Date(now()));
        const result = await collect(`/anime/season/${current.year}/${current.season}`, { sort: 'anime_num_list_users' }, signal);
        const rows = [...result.rows].sort((a, b) => dateValue(b) - dateValue(a));
        const items = mapRows(rows).slice(offset, offset + size);
        return { items, total: result.hasNextPage ? null : rows.length, hasNextPage: offset + size < rows.length, limit: size };
      }
      const rankingType = kind === 'featured' ? 'airing' : 'bypopularity';
      const result = await page('/anime/ranking', { ranking_type: rankingType }, size, offset, signal);
      return { items: mapRows(result.rows), total: null, hasNextPage: result.hasNextPage, limit: size };
    },

    browse,

    async genres(signal: AbortSignal) {
      const result = await collect('/anime/ranking', { ranking_type: 'all' }, signal);
      const counts = new Map<string, number>();
      for (const row of result.rows) {
        if (isAdult(row.node) || !Array.isArray(row.node.genres)) continue;
        for (const genre of row.node.genres) {
          if (!isObject(genre) || typeof genre.name !== 'string' || /^(hentai|erotica)$/i.test(genre.name.trim())) continue;
          counts.set(genre.name, (counts.get(genre.name) ?? 0) + 1);
        }
      }
      return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
    },

    async byRef(ref: Ref, signal: AbortSignal) {
      if (ref.kind !== 'm') throw new ProviderError('not_found', 'Only MyAnimeList catalogue ids are supported.');
      const body = await request(`/anime/${ref.id}`, { fields: DETAIL_FIELDS }, signal);
      const raw = isObject(body.data) ? body.data : body;
      if (!isObject(raw) || isAdult(raw)) throw new ProviderError('not_found', 'MyAnimeList has no matching anime.');
      return toLiveTitle(mapMalAnime(raw, now()), 'mal');
    },

    async related(ref: Ref, limit: number, signal: AbortSignal) {
      if (ref.kind !== 'm') throw new ProviderError('not_found', 'Only MyAnimeList catalogue ids are supported.');
      const body = await request(`/anime/${ref.id}`, { fields: DETAIL_FIELDS }, signal);
      const raw = isObject(body.data) ? body.data : body;
      if (!isObject(raw) || isAdult(raw)) throw new ProviderError('not_found', 'MyAnimeList has no matching anime.');
      const recommendations = Array.isArray(raw.recommendations) ? raw.recommendations : [];
      return mapRows(recommendations.flatMap((item) => isObject(item) && isObject(item.node) ? [{ node: item.node }] : [])).slice(0, Math.min(Math.max(limit, 1), 24));
    },
  };
}
