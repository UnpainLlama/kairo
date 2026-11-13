// Shapes for the live catalogue. These mirror what the React app already expects from /api/v1 (see src/lib/catalog.ts).
import type { Attribution } from '../metadata/types';
import type { Ref } from './ids';
import type { SortKey } from '../lib/validation';

export type SourceId = 'anilist' | 'jikan' | 'hianime';
export type ListKind = 'featured' | 'trending' | 'latest';

export type Card = {
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
  rating: number | null; // 0-10
  episodeCount: number | null;
  genres: string[];
};

/** Catalogue title plus cross-provider IDs used by the independent episode-discovery service. */
export type LiveTitle = { card: Card; altTitles: string[]; malId: number | null; anilistId: number | null; url: string | null; provider: SourceId; /** True when TMDB supplied at least one displayed field. */ tmdbEnriched?: boolean };

export type Paged = { items: LiveTitle[]; total: number | null; hasNextPage: boolean; limit: number };

export type BrowseQuery = {
  q?: string;
  sort: SortKey;
  genre?: string;
  year?: number;
  format?: 'series' | 'movie' | 'ova' | 'ona' | 'special';
  status?: 'airing' | 'finished' | 'upcoming' | 'hiatus';
  season?: 'winter' | 'spring' | 'summer' | 'fall';
  page: number;
  limit: number;
};

export interface CatalogSource {
  readonly id: SourceId;
  readonly displayName: string;
  readonly attribution: Attribution;
  /** Largest page size the provider allows. Requested limits are clamped to it. */
  readonly maxLimit: number;
  supports(ref: Ref): boolean;
  list(kind: ListKind, page: number, limit: number, signal: AbortSignal): Promise<Paged>;
  browse(q: BrowseQuery, signal: AbortSignal): Promise<Paged>;
  genres(signal: AbortSignal): Promise<{ name: string; count: number }[]>;
  byRef(ref: Ref, signal: AbortSignal): Promise<LiveTitle>;
  related(ref: Ref, limit: number, signal: AbortSignal): Promise<LiveTitle[]>;
}

export type LiveEnv = {
  /** D1 is required for account, library and watch-history routes even when the public catalogue is live. */
  DB?: {
    prepare(sql: string): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
    };
  };
  APP_ENV?: string;
  /** "live" (default) serves the configured live providers; "db" keeps the original D1 routes. */
  CATALOG_SOURCE?: string;
  /** Catalogue-provider priority, comma-separated. */
  LIVE_PROVIDERS?: string;
  /** Independent episode-provider priority. Default "jikan". */
  EPISODE_PROVIDERS?: string;
  /** HiAnime mirror base URL; must be one of the adapter's fixed HTTPS allowlist. */
  HIANIME_BASE_URL?: string;
  /** Comma-separated exact HTTPS playback hosts approved for provider-returned URLs. */
  HIANIME_PLAYBACK_ALLOWED_HOSTS?: string;
  /** Opt-in to ZokoAnime's documented iframe route. Off until terms and event contracts are reviewed. */
  ZOKOANIME_EMBED_ENABLED?: string;
  /** TMDB API Read Access Token; configure as a Cloudflare Worker secret, never in vars or source. */
  TMDB_ACCESS_TOKEN?: string;
  METADATA_CACHE?: { get(key: string, type: 'json'): Promise<unknown>; put(key: string, value: string, options: { expirationTtl: number }): Promise<void> };
};

export type LiveRequest = { query: Record<string, string | undefined>; param: (name: string) => string | undefined; requestId: string; env: LiveEnv };
export type LiveResult = { status: number; body: object };
