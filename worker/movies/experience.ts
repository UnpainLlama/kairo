import { providerFetch, readJson, USER_AGENT, type FetchLike, isObject } from '../metadata/providers/http';
import type { MetadataCache } from '../metadata/cache';
import { ProviderError } from '../metadata/types';

export type TmdbMediaType = 'movie' | 'tv' | 'all';
export type TmdbSearchType = 'movie' | 'tv' | 'multi';
export type TmdbFeedKind = 'trending' | 'popular' | 'top_rated' | 'now_playing' | 'upcoming' | 'airing_today' | 'on_the_air' | 'discover';

const API_BASE = 'https://api.themoviedb.org/3';
const API_HOST = 'api.themoviedb.org';

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function positiveId(value: string): boolean {
  return /^\d{1,12}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function pageNumber(value: number): number {
  return Number.isInteger(value) ? Math.max(1, Math.min(500, value)) : 1;
}

/**
 * Server-only TMDB surface for the imported TV UI. Every URL is constructed
 * from a fixed endpoint and allowlisted query values; the browser never sees
 * the TMDB access token and cannot turn this into an arbitrary proxy.
 */
export function createTmdbExperienceService(
  fetchImpl: FetchLike,
  accessToken: string | undefined,
  cache: MetadataCache,
  timeoutMs = 8000,
) {
  const token = accessToken?.trim() ?? '';

  async function request(path: string, params: Record<string, string>, cacheTtl: number): Promise<unknown> {
    if (!token) throw new ProviderError('unavailable', 'TMDB is not configured.');
    const key = 'movies:experience:' + hash(path + '?' + new URLSearchParams(params).toString());
    const cached = await cache.get<unknown>(key);
    if (cached !== null) return cached;

    const url = new URL(API_BASE + path);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await providerFetch(fetchImpl, url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + token,
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      }, API_HOST);
      if (response.status === 404) throw new ProviderError('not_found', 'TMDB has no matching record.');
      if (response.status === 401 || response.status === 403) throw new ProviderError('unavailable', 'TMDB rejected the configured API credentials.');
      if (response.status === 400) throw new ProviderError('invalid_response', 'TMDB rejected the requested catalogue query.');
      if (!response.ok) throw new ProviderError('unavailable', 'TMDB could not complete the catalogue request.');
      const data = await readJson(response);
      if (!isObject(data)) throw new ProviderError('invalid_response', 'TMDB returned an unexpected response.');
      await cache.put(key, data, cacheTtl);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    feed(input: {
      kind: TmdbFeedKind;
      mediaType: TmdbMediaType;
      page: number;
      window?: 'day' | 'week';
      genreIds?: string[];
      sortBy?: string;
      year?: number;
      includeAdult?: boolean;
    }) {
      const page = String(pageNumber(input.page));
      const params: Record<string, string> = { page };
      if (input.kind === 'trending') {
        if (input.mediaType === 'all' && input.genreIds?.length) throw new ProviderError('invalid_response', 'Trending feeds do not accept genre filters.');
        return request('/trending/' + input.mediaType + '/' + (input.window ?? 'week'), params, 600);
      }
      if (input.mediaType === 'all') throw new ProviderError('invalid_response', 'Only trending feeds support all media types.');
      if (input.kind === 'discover') {
        const validGenres = (input.genreIds ?? []).filter((id) => /^\d{1,8}$/.test(id)).slice(0, 10);
        if (validGenres.length) params.with_genres = validGenres.join(',');
        params.sort_by = input.sortBy && ['popularity.desc', 'vote_average.desc', 'primary_release_date.desc', 'primary_release_date.asc', 'first_air_date.desc', 'first_air_date.asc'].includes(input.sortBy)
          ? input.sortBy
          : 'popularity.desc';
        params.include_adult = String(input.includeAdult === true);
        if (input.year && Number.isInteger(input.year) && input.year >= 1800 && input.year <= 2200) {
          params[input.mediaType === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = String(input.year);
        }
        if (input.mediaType === 'movie' && params.sort_by === 'vote_average.desc') params['vote_count.gte'] = '50';
        return request('/discover/' + input.mediaType, params, 1800);
      }
      const endpoints: Record<Exclude<TmdbFeedKind, 'trending' | 'discover'>, string> = {
        popular: '/popular',
        top_rated: '/top_rated',
        now_playing: '/now_playing',
        upcoming: '/upcoming',
        airing_today: '/airing_today',
        on_the_air: '/on_the_air',
      };
      const allowedForMovie = ['popular', 'top_rated', 'now_playing', 'upcoming'];
      const allowedForTv = ['popular', 'top_rated', 'airing_today', 'on_the_air'];
      if (input.mediaType === 'movie' && !allowedForMovie.includes(input.kind)) {
        throw new ProviderError('invalid_response', 'That feed is not available for movies.');
      }
      if (input.mediaType === 'tv' && !allowedForTv.includes(input.kind)) {
        throw new ProviderError('invalid_response', 'That feed is not available for TV.');
      }
      return request('/' + input.mediaType + endpoints[input.kind], params, 1800);
    },

    search(input: { query: string; mediaType: TmdbSearchType; page: number; includeAdult?: boolean }) {
      const query = input.query.trim().replace(/\\s+/g, ' ').slice(0, 120);
      if (!query) return Promise.resolve({ results: [], page: 1, total_pages: 0, total_results: 0 });
      return request('/search/' + input.mediaType, {
        query,
        page: String(pageNumber(input.page)),
        include_adult: String(input.includeAdult === true),
      }, 300);
    },

    detail(mediaType: 'movie' | 'tv', id: string) {
      if (!positiveId(id)) throw new ProviderError('not_found', 'TMDB ID must be a positive integer.');
      return request('/' + mediaType + '/' + id, {
        append_to_response: 'credits,external_ids,videos,images,recommendations,similar',
        include_image_language: 'en,null',
      }, 21600);
    },

    videos(mediaType: 'movie' | 'tv', id: string) {
      if (!positiveId(id)) throw new ProviderError('not_found', 'TMDB ID must be a positive integer.');
      return request('/' + mediaType + '/' + id + '/videos', {}, 43200);
    },

    images(mediaType: 'movie' | 'tv', id: string) {
      if (!positiveId(id)) throw new ProviderError('not_found', 'TMDB ID must be a positive integer.');
      return request('/' + mediaType + '/' + id + '/images', { include_image_language: 'en,null' }, 43200);
    },

    seasons(tvId: string) {
      if (!positiveId(tvId)) throw new ProviderError('not_found', 'TMDB TV ID must be a positive integer.');
      return request('/tv/' + tvId, {}, 43200);
    },

    episodes(tvId: string, seasonNumber: number) {
      if (!positiveId(tvId) || !Number.isInteger(seasonNumber) || seasonNumber < 0 || seasonNumber > 500) {
        throw new ProviderError('not_found', 'Invalid TMDB TV season.');
      }
      return request('/tv/' + tvId + '/season/' + seasonNumber, {}, 43200);
    },

    genres(mediaType: 'movie' | 'tv', language: string) {
      return request('/genre/' + mediaType + '/list', { language }, 86400);
    },

    popularPeople(page: number) {
      return request('/person/popular', { language: 'en-US', page: String(pageNumber(page)) }, 3600);
    },
  };
}
