import { providerFetch, readJson, USER_AGENT, type FetchLike, isObject, asString } from '../../metadata/providers/http';
import type {
  MovieCatalogProvider,
  MovieCredit,
  MovieDetail,
  MovieDiscoverQuery,
  MovieGenre,
  MoviePage,
  MovieSearchQuery,
  MovieSummary,
  MovieProviderAttribution,
} from '../types';
import { MovieProviderError } from '../types';

const API_BASE = 'https://api.themoviedb.org/3';
const API_HOST = 'api.themoviedb.org';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const TMDB_MOVIES_ATTRIBUTION: MovieProviderAttribution = {
  providerId: 'tmdb',
  displayName: 'TMDB',
  text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
  url: 'https://www.themoviedb.org',
  termsUrl: 'https://developer.themoviedb.org/docs/faq',
  requirements: [
    'Show the required TMDB notice and an approved TMDB logo in the application About or Credits area.',
    'Developer API access is for non-commercial use. Obtain a commercial licence from TMDB before using the API for a revenue-generating product.',
    'Keep the API Read Access Token in a server-side secret; never expose it to the browser.',
  ],
};

function positiveInt(value: unknown): number | null {
  const n = typeof value === 'number'
    ? value
    : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function boundedPage(value: number): number {
  return Number.isFinite(value) ? Math.min(500, Math.max(1, Math.floor(value))) : 1;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isFinite(Date.parse(value + 'T00:00:00Z')) ? value : null;
}

function yearFromDate(value: string | null): number | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function imageUrl(path: unknown, size: 'w500' | 'w780' | 'w1280'): string | null {
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i.test(path) || path.includes('..')) return null;
  return IMAGE_BASE + '/' + size + path;
}

function secureUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function finiteNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function mapSummary(raw: unknown): MovieSummary {
  if (!isObject(raw)) throw new MovieProviderError('invalid_response', 'TMDB returned an unexpected movie record.');
  const id = positiveInt(raw.id);
  const title = asString(raw.title);
  if (id === null || !title) throw new MovieProviderError('invalid_response', 'TMDB movie is missing a valid ID or title.');
  const releaseDate = isoDate(raw.release_date);
  return {
    providerId: 'tmdb',
    externalId: String(id),
    title,
    originalTitle: asString(raw.original_title) ?? title,
    overview: asString(raw.overview) ?? '',
    releaseDate,
    releaseYear: yearFromDate(releaseDate),
    originalLanguage: asString(raw.original_language),
    posterUrl: imageUrl(raw.poster_path, 'w500'),
    backdropUrl: imageUrl(raw.backdrop_path, 'w1280'),
    voteAverage: finiteNumber(raw.vote_average, 0, 10),
    voteCount: positiveInt(raw.vote_count) ?? 0,
    popularity: finiteNumber(raw.popularity) ?? 0,
    adult: raw.adult === true,
  };
}

function mapCredit(raw: unknown, kind: 'cast' | 'crew'): MovieCredit | null {
  if (!isObject(raw)) return null;
  const name = asString(raw.name);
  if (!name) return null;
  const personId = positiveInt(raw.id);
  const order = finiteNumber(raw.order, 0, 100000);
  return {
    externalPersonId: personId === null ? null : String(personId),
    name,
    department: asString(raw.known_for_department) ?? asString(raw.department),
    job: asString(raw.job),
    character: kind === 'cast' ? asString(raw.character) : null,
    profileUrl: imageUrl(raw.profile_path, 'w500'),
    order: order === null ? 0 : Math.floor(order),
  };
}

function mapGenres(raw: unknown): MovieGenre[] {
  if (!Array.isArray(raw)) return [];
  const out: MovieGenre[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (!isObject(value)) continue;
    const id = positiveInt(value.id);
    const name = asString(value.name);
    if (id === null || !name || seen.has(String(id))) continue;
    seen.add(String(id));
    out.push({ externalId: String(id), name });
  }
  return out;
}

function mapCountries(raw: unknown): { code: string; name: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (!isObject(value)) return [];
    const code = asString(value.iso_3166_1);
    const name = asString(value.name);
    return code && /^[A-Z]{2}$/.test(code) && name ? [{ code, name }] : [];
  });
}

function mapLanguages(raw: unknown): { code: string; name: string; englishName: string | null }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (!isObject(value)) return [];
    const code = asString(value.iso_639_1);
    const name = asString(value.name);
    if (!code || !/^[a-z]{2,3}$/.test(code) || !name) return [];
    return [{ code, name, englishName: asString(value.english_name) }];
  });
}

function mapMovieDetail(raw: unknown): MovieDetail {
  if (!isObject(raw)) throw new MovieProviderError('invalid_response', 'TMDB returned an unexpected movie detail shape.');
  const summary = mapSummary(raw);
  const credits = isObject(raw.credits) ? raw.credits : {};
  const castRaw = Array.isArray(credits.cast) ? credits.cast : [];
  const crewRaw = Array.isArray(credits.crew) ? credits.crew : [];
  const external = isObject(raw.external_ids) ? raw.external_ids : {};
  const imdb = asString(external.imdb_id) ?? asString(raw.imdb_id);
  return {
    ...summary,
    tagline: asString(raw.tagline) ?? '',
    runtimeMinutes: positiveInt(raw.runtime),
    releaseStatus: asString(raw.status),
    homepageUrl: secureUrl(raw.homepage),
    imdbId: imdb && /^tt\d+$/.test(imdb) ? imdb : null,
    genres: mapGenres(raw.genres),
    productionCountries: mapCountries(raw.production_countries),
    spokenLanguages: mapLanguages(raw.spoken_languages),
    cast: castRaw.slice(0, 40).flatMap((item) => {
      const credit = mapCredit(item, 'cast');
      return credit ? [credit] : [];
    }),
    crew: crewRaw.slice(0, 80).flatMap((item) => {
      const credit = mapCredit(item, 'crew');
      return credit ? [credit] : [];
    }),
  };
}

function mapPage(raw: unknown): MoviePage {
  if (!isObject(raw) || !Array.isArray(raw.results)) {
    throw new MovieProviderError('invalid_response', 'TMDB returned an unexpected movie page.');
  }
  const items = raw.results.flatMap((item) => {
    try { return [mapSummary(item)]; } catch { return []; }
  });
  return {
    items,
    page: positiveInt(raw.page) ?? 1,
    totalPages: positiveInt(raw.total_pages) ?? 0,
    totalResults: positiveInt(raw.total_results) ?? 0,
  };
}

export function createTmdbMovieProvider(
  fetchImpl: FetchLike,
  accessToken: string | undefined,
): MovieCatalogProvider {
  const token = accessToken?.trim() ?? '';

  async function get(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
    if (!token) throw new MovieProviderError('unavailable', 'TMDB is not configured. Set the TMDB_ACCESS_TOKEN Worker secret.');
    const url = new URL(API_BASE + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await providerFetch(fetchImpl, url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
        'User-Agent': USER_AGENT,
      },
      signal,
    }, API_HOST);
    if (response.status === 404) throw new MovieProviderError('not_found', 'TMDB has no matching movie.');
    if (response.status === 401 || response.status === 403) throw new MovieProviderError('unavailable', 'TMDB rejected the configured API credentials.');
    if (response.status === 400) throw new MovieProviderError('invalid_response', 'TMDB rejected the movie request.');
    if (!response.ok) throw new MovieProviderError('unavailable', 'TMDB could not complete the movie request.');
    return readJson(response);
  }

  return {
    id: 'tmdb',
    displayName: 'TMDB',
    termsVerified: true,
    attribution: TMDB_MOVIES_ATTRIBUTION,

    async discover(query: MovieDiscoverQuery, signal: AbortSignal): Promise<MoviePage> {
      const page = boundedPage(query.page);
      const params: Record<string, string> = { page: String(page) };
      const validYear = query.year !== undefined && Number.isInteger(query.year) && query.year >= 1800 && query.year <= 2200;
      const validGenres = (query.genreIds ?? []).filter((id) => /^\d+$/.test(id)).slice(0, 10);
      const validLanguage = Boolean(query.originalLanguage && /^[a-z]{2,3}$/.test(query.originalLanguage));
      if (validYear) params.primary_release_year = String(query.year);
      if (validGenres.length) params.with_genres = validGenres.join(',');
      if (validLanguage) params.with_original_language = query.originalLanguage!;
      const includeAdult = query.includeAdult === true;

      const kindPath: Record<MovieDiscoverQuery['kind'], string> = {
        trending_day: '/trending/movie/day',
        trending_week: '/trending/movie/week',
        popular: '/movie/popular',
        top_rated: '/movie/top_rated',
        upcoming: '/movie/upcoming',
        now_playing: '/movie/now_playing',
      };
      const hasFilters = Boolean(validYear || validGenres.length || validLanguage || includeAdult);
      const path = hasFilters ? '/discover/movie' : kindPath[query.kind];
      if (hasFilters) {
        const sortBy: Record<MovieDiscoverQuery['kind'], string> = {
          trending_day: 'popularity.desc',
          trending_week: 'popularity.desc',
          popular: 'popularity.desc',
          top_rated: 'vote_average.desc',
          upcoming: 'primary_release_date.asc',
          now_playing: 'popularity.desc',
        };
        params.include_adult = String(includeAdult);
        params.sort_by = sortBy[query.kind];
        if (query.kind === 'top_rated') params['vote_count.gte'] = '50';
      }
      // Deliberately omit region/watch_region: catalogue discovery is global.
      return mapPage(await get(path, params, signal));
    },

    async search(query: MovieSearchQuery, signal: AbortSignal): Promise<MoviePage> {
      const term = query.query.trim().slice(0, 120);
      if (!term) return { items: [], page: 1, totalPages: 0, totalResults: 0 };
      const params: Record<string, string> = {
        query: term,
        page: String(boundedPage(query.page)),
        include_adult: String(query.includeAdult === true),
      };
      if (query.year !== undefined && Number.isInteger(query.year) && query.year >= 1800 && query.year <= 2200) {
        params.primary_release_year = String(query.year);
      }
      if (query.language && /^[a-z]{2}-[A-Z]{2}$/.test(query.language)) params.language = query.language;
      return mapPage(await get('/search/movie', params, signal));
    },

    async byId(externalId: string, signal: AbortSignal): Promise<MovieDetail> {
      if (!/^\d{1,12}$/.test(externalId) || positiveInt(externalId) === null) {
        throw new MovieProviderError('not_found', 'TMDB movie ID must be a positive integer.');
      }
      const raw = await get('/movie/' + externalId, { append_to_response: 'credits,external_ids' }, signal);
      return mapMovieDetail(raw);
    },

    async genres(language: string, signal: AbortSignal): Promise<MovieGenre[]> {
      const params: Record<string, string> = {};
      if (/^[a-z]{2}-[A-Z]{2}$/.test(language)) params.language = language;
      const raw = await get('/genre/movie/list', params, signal);
      if (!isObject(raw)) throw new MovieProviderError('invalid_response', 'TMDB returned an unexpected genre list.');
      return mapGenres(raw.genres);
    },
  };
}
