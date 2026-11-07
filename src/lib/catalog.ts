// Shapes returned by the Worker (see worker/index.ts and docs/API_CONTRACT.md). Nullable columns stay nullable.
export type CatalogCard = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  posterUrl: string | null;
  bannerUrl: string | null;
  format: string | null;
  releaseYear: number | null;
  season: string | null;
  status: string | null;
  rating: number | null;
  episodeCount: number | null;
  genres: unknown[];
  sharedGenres?: number;
};

export type AnimeDetails = CatalogCard & { altTitles: unknown[] };

export type Episode = {
  id: string;
  animeId: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
};

export type ItemList<T> = { items: T[] };
export type GenreCount = { name: string; count: number };

export const textList = (values: unknown[] | undefined): string[] =>
  (values ?? []).filter((v): v is string => typeof v === 'string' && v.trim() !== '');

const FORMAT_LABELS: Record<string, string> = { series: 'Series', movie: 'Movie', ova: 'OVA', ona: 'ONA', special: 'Special' };
const STATUS_LABELS: Record<string, string> = { airing: 'Airing', finished: 'Finished', upcoming: 'Upcoming', hiatus: 'On hiatus' };

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const formatLabel = (v: string | null): string | null => (v ? FORMAT_LABELS[v.toLowerCase()] ?? capitalise(v) : null);
export const statusLabel = (v: string | null): string | null => (v ? STATUS_LABELS[v.toLowerCase()] ?? capitalise(v) : null);
export const seasonLabel = (season: string | null, year: number | null): string | null => {
  const parts = [season ? capitalise(season.toLowerCase()) : null, year ? String(year) : null].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
};

export function episodeCountLabel(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  return n === 1 ? '1 episode' : `${n} episodes`;
}

export function durationLabel(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  return minutes < 1 ? '<1 min' : `${minutes} min`;
}

export function episodeNumberLabel(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

export function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Only http(s) image URLs are ever used as an <img src>. */
export const safeImageUrl = (url: string | null): string | null => (url && /^https?:\/\//i.test(url) ? url : null);

export type SourceRef = { providerId: string; displayName: string; text: string; url: string; license: string | null };
export type ProviderOutcome = { provider: string; state: 'ok' | 'cached' | 'not_found' | 'skipped' | 'failed'; reason?: string };
/** GET /anime/:id/metadata: the unified, multi-provider record. Only the fields the UI uses are typed. */
export type UnifiedMetadata = {
  title: string | null;
  synopsis: string | null;
  rating: number | null;
  episodeCount: number | null;
  genres: unknown[];
  posterUrl: string | null;
  bannerUrl: string | null;
  sources: SourceRef[];
  providers: ProviderOutcome[];
};
