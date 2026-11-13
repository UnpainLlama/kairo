const API = '/api/v1/movies/experience';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const CACHE_KEY = 'tvui:avatars:v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface AvatarOption {
  id: string;
  url: string;
  label: string;
  kind: 'person' | 'poster';
}

interface CachedAvatars {
  ts: number;
  options: AvatarOption[];
}
interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
}
interface TmdbPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
}
interface TmdbPersonResponse {
  results: TmdbPerson[];
}
interface TmdbTitleDetail {
  poster_path: string | null;
}

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

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(API + path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new Error('Could not load profile artwork.');
  }
  return payload.data;
}

async function fetchPopularPeople(): Promise<AvatarOption[]> {
  try {
    const data = await apiGet<TmdbPersonResponse>('/people/popular?page=1');
    return (data.results ?? [])
      .filter((person) => !!person.profile_path && person.known_for_department === 'Acting')
      .slice(0, 12)
      .map((person) => ({
        id: `person-${person.id}`,
        url: `${IMG_BASE}/w300${person.profile_path}`,
        label: person.name,
        kind: 'person' as const,
      }));
  } catch {
    return [];
  }
}

async function fetchFranchisePosters(): Promise<AvatarOption[]> {
  const results = await Promise.all(FRANCHISE_TITLES.map(async (item): Promise<AvatarOption | null> => {
    try {
      const data = await apiGet<TmdbTitleDetail>(`/detail/${item.mediaType}/${item.tmdbId}`);
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
  }));
  return results.filter((item): item is AvatarOption => item !== null);
}

export async function fetchProfileAvatars(): Promise<AvatarOption[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: CachedAvatars = JSON.parse(raw);
      if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS && Array.isArray(cached.options)) {
        return cached.options;
      }
    }
  } catch { /* ignore unavailable browser storage */ }

  const [people, posters] = await Promise.all([fetchPopularPeople(), fetchFranchisePosters()]);
  const merged: AvatarOption[] = [];
  const max = Math.max(people.length, posters.length);
  for (let i = 0; i < max; i += 1) {
    if (i < people.length) merged.push(people[i]);
    if (i < posters.length) merged.push(posters[i]);
  }
  if (merged.length) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), options: merged }));
    } catch { /* ignore unavailable browser storage */ }
  }
  return merged;
}

export async function getRandomAvatar(): Promise<string> {
  const list = await fetchProfileAvatars();
  return list.length ? list[Math.floor(Math.random() * list.length)].url : '';
}
