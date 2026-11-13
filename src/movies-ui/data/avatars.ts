// Profile avatar fetching: pulls from TMDB person endpoint (actor headshots)
// + a curated franchise list (movie posters cropped to top portion).

const TOKEN = import.meta.env.VITE_TMDB_TOKEN as string;
const IMG_BASE = 'https://image.tmdb.org/t/p';
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

const CACHE_KEY = 'tvui:avatars:v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface AvatarOption {
  id: string;
  url: string;
  /** Description for accessibility */
  label: string;
  /** "person" = actor headshot, "poster" = movie poster crop */
  kind: 'person' | 'poster';
}

interface CachedAvatars {
  ts: number;
  options: AvatarOption[];
}

// Curated franchise list — popular TMDB movie/TV ids with iconic poster art
const FRANCHISE_TITLES: { tmdbId: number; mediaType: 'movie' | 'tv'; label: string }[] = [
  { tmdbId: 299536, mediaType: 'movie', label: 'Avengers: Infinity War' },
  { tmdbId: 11, mediaType: 'movie', label: 'Star Wars' },
  { tmdbId: 1396, mediaType: 'tv', label: 'Breaking Bad' },
  { tmdbId: 66732, mediaType: 'tv', label: 'Stranger Things' },
  { tmdbId: 1399, mediaType: 'tv', label: 'Game of Thrones' },
  { tmdbId: 603, mediaType: 'movie', label: 'The Matrix' },
  { tmdbId: 122, mediaType: 'movie', label: 'LOTR: Return of the King' },
  { tmdbId: 671, mediaType: 'movie', label: 'Harry Potter' },
  { tmdbId: 60625, mediaType: 'tv', label: 'Rick and Morty' },
  { tmdbId: 1402, mediaType: 'tv', label: 'The Walking Dead' },
];

interface TmdbPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
}

interface TmdbPersonResponse {
  results: TmdbPerson[];
}

interface TmdbMovieDetail {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
}

async function fetchPopularPeople(): Promise<AvatarOption[]> {
  try {
    const res = await fetch(
      'https://api.themoviedb.org/3/person/popular?page=1',
      { headers }
    );
    if (!res.ok) return [];
    const data: TmdbPersonResponse = await res.json();
    return data.results
      .filter((p) => !!p.profile_path && p.known_for_department === 'Acting')
      .slice(0, 12)
      .map((p) => ({
        id: `person-${p.id}`,
        url: `${IMG_BASE}/w300${p.profile_path}`,
        label: p.name,
        kind: 'person' as const,
      }));
  } catch {
    return [];
  }
}

async function fetchFranchisePosters(): Promise<AvatarOption[]> {
  const results = await Promise.all(
    FRANCHISE_TITLES.map(async (item): Promise<AvatarOption | null> => {
      try {
        const url = item.mediaType === 'movie'
          ? `https://api.themoviedb.org/3/movie/${item.tmdbId}`
          : `https://api.themoviedb.org/3/tv/${item.tmdbId}`;
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        const data: TmdbMovieDetail = await res.json();
        if (!data.poster_path) return null;
        return {
          id: `poster-${item.tmdbId}`,
          url: `${IMG_BASE}/w300${data.poster_path}`,
          label: item.label,
          kind: 'poster',
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((x): x is AvatarOption => x !== null);
}

/**
 * Fetch a curated mix of profile avatars (actor headshots + franchise posters).
 * Cached in localStorage for 7 days. Always returns at least the cached set on failure.
 */
export async function fetchProfileAvatars(): Promise<AvatarOption[]> {
  // Check cache first
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: CachedAvatars = JSON.parse(raw);
      if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS && Array.isArray(cached.options)) {
        return cached.options;
      }
    }
  } catch { /* ignore */ }

  // Fetch fresh
  const [people, posters] = await Promise.all([
    fetchPopularPeople(),
    fetchFranchisePosters(),
  ]);

  // Interleave for visual variety
  const merged: AvatarOption[] = [];
  const max = Math.max(people.length, posters.length);
  for (let i = 0; i < max; i++) {
    if (i < people.length) merged.push(people[i]);
    if (i < posters.length) merged.push(posters[i]);
  }

  // Cache
  if (merged.length > 0) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), options: merged }));
    } catch { /* ignore */ }
  }

  return merged;
}

/** Pick a random default avatar URL from the cached/fresh list. */
export async function getRandomAvatar(): Promise<string> {
  const list = await fetchProfileAvatars();
  if (list.length === 0) return '';
  return list[Math.floor(Math.random() * list.length)].url;
}
