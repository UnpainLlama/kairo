import type { RowData, TileData } from '../state/slices/contentSlice';

const API = '/api/v1/movies/experience';
const IMG_BASE = 'https://image.tmdb.org/t/p';

export type MediaType = 'movie' | 'tv' | 'all';
export interface RowConfig {
  id?: string;
  title: string;
  kind: 'trending' | 'popular' | 'top_rated' | 'now_playing' | 'upcoming' | 'airing_today' | 'on_the_air' | 'discover';
  mediaType: MediaType;
  window?: 'day' | 'week';
  genreId?: number;
  sortBy?: string;
}

interface TmdbResult {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  media_type?: string;
}

interface TmdbPage {
  results: TmdbResult[];
  page?: number;
  total_pages?: number;
  total_results?: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(API + path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error(payload?.error?.message ?? `Movies API request failed (${response.status}).`);
  }
  return payload.data;
}

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics',
};

export function toTile(item: TmdbResult, fallbackMediaType?: MediaType): TileData | null {
  const mediaType = item.media_type === 'tv' || item.first_air_date
    ? 'tv'
    : item.media_type === 'movie' || item.release_date
      ? 'movie'
      : fallbackMediaType === 'tv' ? 'tv' : 'movie';
  const imagePath = item.backdrop_path || item.poster_path;
  if (!imagePath) return null;
  const date = item.release_date || item.first_air_date || '';
  const parsedYear = Number(date.slice(0, 4));
  const vote = typeof item.vote_average === 'number' && Number.isFinite(item.vote_average)
    ? item.vote_average
    : 0;
  const genre = (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).find(Boolean) ?? 'Drama';

  return {
    id: `tmdb-${mediaType}-${item.id}`,
    title: item.title || item.name || 'Untitled',
    year: parsedYear >= 1800 && parsedYear <= 2200 ? parsedYear : new Date().getFullYear(),
    rating: vote > 0 ? `${vote.toFixed(1)}/10` : 'NR',
    genre,
    synopsis: item.overview || 'No description available.',
    imageIndex: item.id,
    backdropPath: item.backdrop_path ?? item.poster_path ?? undefined,
    posterPath: item.poster_path ?? undefined,
    tmdbId: item.id,
    mediaType,
  };
}

const HOME_ROWS: RowConfig[] = [
  { title: 'Trending Now', kind: 'trending', mediaType: 'all', window: 'week' },
  { title: 'Popular Movies', kind: 'popular', mediaType: 'movie' },
  { title: 'Top Rated', kind: 'top_rated', mediaType: 'movie' },
  { title: 'Now Playing', kind: 'now_playing', mediaType: 'movie' },
  { title: 'Popular TV Shows', kind: 'popular', mediaType: 'tv' },
  { title: 'Top Rated TV', kind: 'top_rated', mediaType: 'tv' },
  { title: 'Upcoming', kind: 'upcoming', mediaType: 'movie' },
  { title: 'Action Movies', kind: 'discover', mediaType: 'movie', genreId: 28 },
  { title: 'Sci-Fi', kind: 'discover', mediaType: 'movie', genreId: 878 },
  { title: 'Comedies', kind: 'discover', mediaType: 'movie', genreId: 35 },
  { title: 'Thrillers', kind: 'discover', mediaType: 'movie', genreId: 53 },
  { title: 'Documentaries', kind: 'discover', mediaType: 'movie', genreId: 99 },
];

export async function fetchTmdbContent(): Promise<RowData[]> {
  return fetchRowsFromConfigs(HOME_ROWS);
}

export async function fetchLogosProgressive(
  rows: RowData[],
  onUpdate: (updatedRows: RowData[]) => void
): Promise<void> {
  const tasks: Array<{ rowIdx: number; tileIdx: number; tmdbId: number; mediaType: 'movie' | 'tv' }> = [];
  rows.forEach((row, rowIdx) => row.tiles.forEach((tile, tileIdx) => {
    if (tile.tmdbId && tile.mediaType) tasks.push({ rowIdx, tileIdx, tmdbId: tile.tmdbId, mediaType: tile.mediaType });
  }));

  const BATCH_SIZE = 12;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (task) => ({
      ...task,
      logoPath: await fetchTitleLogo(task.tmdbId, task.mediaType),
    })));
    let changed = false;
    const updated = rows.map((row, rowIdx) => ({
      ...row,
      tiles: row.tiles.map((tile, tileIdx) => {
        const match = results.find((result) => result.rowIdx === rowIdx && result.tileIdx === tileIdx && result.logoPath);
        if (!match) return tile;
        changed = true;
        return { ...tile, logoPath: match.logoPath! };
      }),
    }));
    if (changed) {
      rows = updated;
      onUpdate(updated);
    }
  }
}

export function getTmdbBackdropUrl(path: string, size = 'w780'): string {
  return `${IMG_BASE}/${size}${path}`;
}
export function getTmdbPosterUrl(path: string, size = 'w342'): string {
  return `${IMG_BASE}/${size}${path}`;
}
export function getTmdbLogoUrl(path: string, size = 'w500'): string {
  return `${IMG_BASE}/${size}${path}`;
}
export function getTmdbStillUrl(path: string, size = 'w300'): string {
  return `${IMG_BASE}/${size}${path}`;
}

export async function fetchRowsFromConfigs(configs: RowConfig[]): Promise<RowData[]> {
  const results = await Promise.all(configs.map(async (config, index) => {
    try {
      const params = new URLSearchParams({
        kind: config.kind,
        media_type: config.mediaType,
        page: '1',
      });
      if (config.window) params.set('window', config.window);
      if (config.genreId) params.set('genres', String(config.genreId));
      if (config.sortBy) params.set('sort_by', config.sortBy);
      const page = await apiGet<TmdbPage>(`/feed?${params.toString()}`);
      const tiles = (page.results ?? [])
        .map((item) => toTile(item, config.mediaType))
        .filter((tile): tile is TileData => tile !== null);
      return { id: config.id ?? `row-${index}`, title: config.title, tiles };
    } catch {
      return null;
    }
  }));
  return results.filter((row): row is RowData => row !== null && row.tiles.length > 0);
}

export async function searchTmdb(query: string): Promise<RowData[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({ q: query.trim().slice(0, 120), media_type: 'multi', page: '1' });
    const page = await apiGet<TmdbPage>(`/search?${params.toString()}`);
    const items = page.results ?? [];
    const allTiles = items.map((item) => toTile(item)).filter((tile): tile is TileData => tile !== null);
    const movieTiles = allTiles.filter((tile) => tile.mediaType === 'movie');
    const tvTiles = allTiles.filter((tile) => tile.mediaType === 'tv');
    const rows: RowData[] = [];
    if (allTiles.length) rows.push({ id: 'search-top', title: `Top Results for "${query}"`, tiles: allTiles });
    if (movieTiles.length) rows.push({ id: 'search-movies', title: 'Movies', tiles: movieTiles });
    if (tvTiles.length) rows.push({ id: 'search-tv', title: 'TV Shows', tiles: tvTiles });
    return rows;
  } catch {
    return [];
  }
}

const trailerCache = new Map<string, { key: string | null; ts: number }>();
const NULL_TTL_MS = 60_000;

interface TmdbVideoResult {
  key: string;
  site: string;
  type: string;
  official: boolean;
}

export async function fetchTrailerKey(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
  const cacheKey = `${mediaType}-${tmdbId}`;
  const cached = trailerCache.get(cacheKey);
  if (cached && (cached.key !== null || Date.now() - cached.ts < NULL_TTL_MS)) return cached.key;
  try {
    const data = await apiGet<{ results: TmdbVideoResult[] }>(`/${mediaType}/${tmdbId}/videos`);
    const videos = (data.results ?? []).filter((video) => video.site === 'YouTube');
    const pick = videos.find((video) => video.type === 'Trailer' && video.official)
      ?? videos.find((video) => video.type === 'Trailer')
      ?? videos.find((video) => video.type === 'Teaser')
      ?? videos[0]
      ?? null;
    const key = pick?.key ?? null;
    trailerCache.set(cacheKey, { key, ts: Date.now() });
    return key;
  } catch {
    trailerCache.set(cacheKey, { key: null, ts: Date.now() });
    return null;
  }
}

interface TmdbImageResult { file_path: string; iso_639_1: string | null; width: number }
export async function fetchTitleLogo(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
  try {
    const data = await apiGet<{ logos: TmdbImageResult[] }>(`/${mediaType}/${tmdbId}/images`);
    const logos = data.logos ?? [];
    const english = logos.filter((logo) => logo.iso_639_1 === 'en').sort((a, b) => b.width - a.width);
    return (english[0] ?? logos[0])?.file_path ?? null;
  } catch {
    return null;
  }
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  posterPath: string | null;
}
export interface Episode {
  episodeNumber: number;
  name: string;
  overview: string;
  stillPath: string | null;
  runtime: number | null;
  airDate: string | null;
}
interface TmdbSeasonRecord {
  season_number: number;
  name: string;
  episode_count: number;
  poster_path: string | null;
}
interface TmdbEpisodeRecord {
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  runtime: number | null;
  air_date: string | null;
}
const seasonsCache = new Map<number, SeasonSummary[]>();
const episodesCache = new Map<string, Episode[]>();

export function getCachedSeasons(tvId: number): SeasonSummary[] {
  return seasonsCache.get(tvId) ?? [];
}
export function getCachedEpisodes(tvId: number, seasonNumber: number): Episode[] {
  return episodesCache.get(`${tvId}-${seasonNumber}`) ?? [];
}
export async function fetchTvSeasons(tvId: number): Promise<SeasonSummary[]> {
  const cached = seasonsCache.get(tvId);
  if (cached) return cached;
  try {
    const data = await apiGet<{ seasons: TmdbSeasonRecord[] }>(`/tv/${tvId}/seasons`);
    const seasons = (data.seasons ?? []).filter((season) => season.season_number > 0).map((season) => ({
      seasonNumber: season.season_number,
      name: season.name,
      episodeCount: season.episode_count,
      posterPath: season.poster_path,
    }));
    seasonsCache.set(tvId, seasons);
    return seasons;
  } catch {
    return [];
  }
}
export async function fetchEpisodes(tvId: number, seasonNumber: number): Promise<Episode[]> {
  const cacheKey = `${tvId}-${seasonNumber}`;
  const cached = episodesCache.get(cacheKey);
  if (cached) return cached;
  try {
    const data = await apiGet<{ episodes: TmdbEpisodeRecord[] }>(`/tv/${tvId}/seasons/${seasonNumber}`);
    const episodes = (data.episodes ?? []).map((episode) => ({
      episodeNumber: episode.episode_number,
      name: episode.name,
      overview: episode.overview,
      stillPath: episode.still_path,
      runtime: episode.runtime,
      airDate: episode.air_date,
    }));
    episodesCache.set(cacheKey, episodes);
    return episodes;
  } catch {
    return [];
  }
}
