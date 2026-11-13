import type { RowData, TileData } from '../state/slices/contentSlice';

const TOKEN = import.meta.env.VITE_TMDB_TOKEN as string;
const IMG_BASE = 'https://image.tmdb.org/t/p';

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

interface TmdbResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  backdrop_path: string | null;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids: number[];
  media_type?: string;
}

interface TmdbResponse {
  results: TmdbResult[];
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

export function toTile(item: TmdbResult): TileData | null {
  if (!item.backdrop_path) return null;
  const year = parseInt(
    (item.release_date || item.first_air_date || '0000').slice(0, 4),
    10
  );
  const genre = GENRE_MAP[item.genre_ids[0]] ?? 'Drama';
  const rating = item.vote_average >= 8 ? 'TV-MA' :
                 item.vote_average >= 6 ? 'TV-14' : 'TV-PG';

  return {
    id: `tmdb-${item.id}`,
    title: item.title || item.name || 'Untitled',
    year: year || 2024,
    rating,
    genre,
    synopsis: item.overview || 'No description available.',
    imageIndex: item.id,
    backdropPath: item.backdrop_path,
    posterPath: item.poster_path ?? undefined,
    tmdbId: item.id,
    mediaType: (item.media_type === 'tv' || item.first_air_date) ? 'tv' as const : 'movie' as const,
  };
}

export async function fetchTmdb(url: string): Promise<TmdbResult[]> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data: TmdbResponse = await res.json();
  return data.results;
}

export interface RowConfig {
  title: string;
  url: string;
}

const ROW_CONFIGS: RowConfig[] = [
  { title: 'Trending Now', url: 'https://api.themoviedb.org/3/trending/all/week' },
  { title: 'Popular Movies', url: 'https://api.themoviedb.org/3/movie/popular' },
  { title: 'Top Rated', url: 'https://api.themoviedb.org/3/movie/top_rated' },
  { title: 'Now Playing', url: 'https://api.themoviedb.org/3/movie/now_playing' },
  { title: 'Popular TV Shows', url: 'https://api.themoviedb.org/3/tv/popular' },
  { title: 'Top Rated TV', url: 'https://api.themoviedb.org/3/tv/top_rated' },
  { title: 'Upcoming', url: 'https://api.themoviedb.org/3/movie/upcoming' },
  { title: 'Action Movies', url: 'https://api.themoviedb.org/3/discover/movie?with_genres=28&sort_by=popularity.desc' },
  { title: 'Sci-Fi', url: 'https://api.themoviedb.org/3/discover/movie?with_genres=878&sort_by=popularity.desc' },
  { title: 'Comedies', url: 'https://api.themoviedb.org/3/discover/movie?with_genres=35&sort_by=popularity.desc' },
  { title: 'Thrillers', url: 'https://api.themoviedb.org/3/discover/movie?with_genres=53&sort_by=popularity.desc' },
  { title: 'Documentaries', url: 'https://api.themoviedb.org/3/discover/movie?with_genres=99&sort_by=popularity.desc' },
];

/**
 * Fetch rows with backdrops (fast — 12 parallel calls).
 * Returns content immediately so the UI can render.
 */
export async function fetchTmdbContent(): Promise<RowData[]> {
  const results = await Promise.all(
    ROW_CONFIGS.map(async (config, idx) => {
      try {
        const items = await fetchTmdb(config.url);
        const tiles = items
          .map(toTile)
          .filter((t): t is TileData => t !== null);
        return {
          id: `row-${idx}`,
          title: config.title,
          tiles,
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is RowData => r !== null && r.tiles.length > 0);
}

/**
 * Stream logos into rows progressively.
 * Calls onUpdate each time a batch of logos resolves so the UI can re-render.
 */
export async function fetchLogosProgressive(
  rows: RowData[],
  onUpdate: (updatedRows: RowData[]) => void
): Promise<void> {
  const BATCH_SIZE = 16; // concurrent fetches at a time

  // Collect all tiles that need logos
  const tasks: Array<{ rowIdx: number; tileIdx: number; tmdbId: number; mediaType: 'movie' | 'tv' }> = [];
  for (let r = 0; r < rows.length; r++) {
    for (let t = 0; t < rows[r].tiles.length; t++) {
      const tile = rows[r].tiles[t];
      if (tile.tmdbId && tile.mediaType) {
        tasks.push({ rowIdx: r, tileIdx: t, tmdbId: tile.tmdbId, mediaType: tile.mediaType });
      }
    }
  }

  // Process in batches
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (task) => {
        const logoPath = await fetchTitleLogo(task.tmdbId, task.mediaType);
        return { ...task, logoPath };
      })
    );

    // Apply logos to a deep-copied rows array
    let changed = false;
    const updated = rows.map((row, rIdx) => ({
      ...row,
      tiles: row.tiles.map((tile, tIdx) => {
        const match = results.find((r) => r.rowIdx === rIdx && r.tileIdx === tIdx && r.logoPath);
        if (match) {
          changed = true;
          return { ...tile, logoPath: match.logoPath! };
        }
        return tile;
      }),
    }));

    if (changed) {
      rows = updated;
      onUpdate(updated);
    }
  }
}

// Build image URL from a TMDB backdrop_path
// We store the tmdb id in imageIndex but need the actual path from the tile data
// So we'll use a separate lookup approach
export function getTmdbBackdropUrl(backdropPath: string, size = 'w780'): string {
  return `${IMG_BASE}/${size}${backdropPath}`;
}

export function getTmdbPosterUrl(posterPath: string, size = 'w342'): string {
  return `${IMG_BASE}/${size}${posterPath}`;
}

export function getTmdbLogoUrl(logoPath: string, size = 'w500'): string {
  return `${IMG_BASE}/${size}${logoPath}`;
}

interface TmdbImageResult {
  file_path: string;
  iso_639_1: string | null;
  width: number;
}

interface TmdbImagesResponse {
  logos: TmdbImageResult[];
}

/**
 * Fetch rows from an array of RowConfig objects.
 * Reusable for any page's content.
 */
export async function fetchRowsFromConfigs(configs: RowConfig[]): Promise<RowData[]> {
  const results = await Promise.all(
    configs.map(async (config, idx) => {
      try {
        const items = await fetchTmdb(config.url);
        const tiles = items
          .map(toTile)
          .filter((t): t is TileData => t !== null);
        return {
          id: `row-${idx}`,
          title: config.title,
          tiles,
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is RowData => r !== null && r.tiles.length > 0);
}

/**
 * Search TMDB for movies and TV shows matching a query.
 */
export async function searchTmdb(query: string): Promise<RowData[]> {
  if (!query.trim()) return [];
  try {
    const items = await fetchTmdb(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&include_adult=false`
    );
    const movieTiles = items
      .filter((i) => (i.media_type === 'movie' || (!i.media_type && i.release_date)) && i.backdrop_path)
      .map(toTile)
      .filter((t): t is TileData => t !== null);
    const tvTiles = items
      .filter((i) => (i.media_type === 'tv' || (!i.media_type && i.first_air_date)) && i.backdrop_path)
      .map(toTile)
      .filter((t): t is TileData => t !== null);

    const rows: RowData[] = [];
    if (movieTiles.length > 0) {
      rows.push({ id: 'search-movies', title: 'Movies', tiles: movieTiles });
    }
    if (tvTiles.length > 0) {
      rows.push({ id: 'search-tv', title: 'TV Shows', tiles: tvTiles });
    }
    // Also add a combined "Top Results" row if we have both
    const allTiles = items
      .map(toTile)
      .filter((t): t is TileData => t !== null);
    if (allTiles.length > 0) {
      rows.unshift({ id: 'search-top', title: `Top Results for "${query}"`, tiles: allTiles });
    }
    return rows;
  } catch {
    return [];
  }
}

// --- Trailer key cache ---
interface CacheEntry {
  key: string | null;
  ts: number;
}
const trailerCache = new Map<string, CacheEntry>();
const NULL_TTL_MS = 60_000; // retry null entries after 60s

interface TmdbVideoResult {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
}

interface TmdbVideosResponse {
  results: TmdbVideoResult[];
}

/**
 * Fetch a YouTube trailer key for a given TMDB title.
 * Prefers official trailers, then teasers, then any YouTube video.
 * Results are cached; null entries expire after 60s.
 */
export async function fetchTrailerKey(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<string | null> {
  const cacheKey = `${mediaType}-${tmdbId}`;
  const cached = trailerCache.get(cacheKey);
  if (cached) {
    // Non-null entries never expire; null entries expire after TTL
    if (cached.key !== null || Date.now() - cached.ts < NULL_TTL_MS) {
      return cached.key;
    }
  }

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos`,
      { headers }
    );
    if (!res.ok) {
      trailerCache.set(cacheKey, { key: null, ts: Date.now() });
      return null;
    }
    const data: TmdbVideosResponse = await res.json();
    const ytVideos = data.results.filter((v) => v.site === 'YouTube');

    // Priority: official trailer > any trailer > teaser > any video
    const pick =
      ytVideos.find((v) => v.type === 'Trailer' && v.official) ??
      ytVideos.find((v) => v.type === 'Trailer') ??
      ytVideos.find((v) => v.type === 'Teaser') ??
      ytVideos[0] ??
      null;

    const key = pick?.key ?? null;
    trailerCache.set(cacheKey, { key, ts: Date.now() });
    return key;
  } catch {
    trailerCache.set(cacheKey, { key: null, ts: Date.now() });
    return null;
  }
}

/**
 * Fetch the English logo image for a given title.
 * Returns the logo path or null if none found.
 */
export async function fetchTitleLogo(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/images?include_image_language=en,null`,
      { headers }
    );
    if (!res.ok) return null;
    const data: TmdbImagesResponse = await res.json();
    // Prefer English logos, pick the widest one for quality
    const english = data.logos
      .filter((l) => l.iso_639_1 === 'en')
      .sort((a, b) => b.width - a.width);
    const logo = english[0] ?? data.logos[0];
    return logo?.file_path ?? null;
  } catch {
    return null;
  }
}

// --- Season/Episode data for TV shows ---

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

interface TmdbTvDetailResponse {
  seasons: {
    season_number: number;
    name: string;
    episode_count: number;
    poster_path: string | null;
  }[];
}

interface TmdbSeasonResponse {
  episodes: {
    episode_number: number;
    name: string;
    overview: string;
    still_path: string | null;
    runtime: number | null;
    air_date: string | null;
  }[];
}

const tvDetailCache = new Map<number, SeasonSummary[]>();
const episodeCache = new Map<string, Episode[]>();

/** Synchronously read the cached season list (returns [] if not yet fetched). */
export function getCachedSeasons(tvId: number): SeasonSummary[] {
  return tvDetailCache.get(tvId) ?? [];
}

/** Synchronously read the cached episode list for a season (returns [] if not yet fetched). */
export function getCachedEpisodes(tvId: number, seasonNumber: number): Episode[] {
  return episodeCache.get(`${tvId}-${seasonNumber}`) ?? [];
}

export async function fetchTvSeasons(tvId: number): Promise<SeasonSummary[]> {
  const cached = tvDetailCache.get(tvId);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}`, { headers });
    if (!res.ok) return [];
    const data: TmdbTvDetailResponse = await res.json();
    const seasons = data.seasons
      .filter((s) => s.season_number > 0) // exclude "specials" (season 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count,
        posterPath: s.poster_path,
      }));
    tvDetailCache.set(tvId, seasons);
    return seasons;
  } catch {
    return [];
  }
}

export async function fetchEpisodes(tvId: number, seasonNumber: number): Promise<Episode[]> {
  const key = `${tvId}-${seasonNumber}`;
  const cached = episodeCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}`,
      { headers }
    );
    if (!res.ok) return [];
    const data: TmdbSeasonResponse = await res.json();
    const episodes = data.episodes.map((ep) => ({
      episodeNumber: ep.episode_number,
      name: ep.name,
      overview: ep.overview,
      stillPath: ep.still_path,
      runtime: ep.runtime,
      airDate: ep.air_date,
    }));
    episodeCache.set(key, episodes);
    return episodes;
  } catch {
    return [];
  }
}

export function getTmdbStillUrl(stillPath: string, size = 'w300'): string {
  return `${IMG_BASE}/${size}${stillPath}`;
}
