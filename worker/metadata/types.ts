// Provider-neutral types. Nothing in this folder imports Workers bindings, so everything is unit-testable.
// Metadata, episode discovery and playback are SEPARATE services: a metadata provider is never assumed to offer the others.

export type Format = 'series' | 'movie' | 'ova' | 'ona' | 'special';
export type Status = 'airing' | 'finished' | 'upcoming' | 'hiatus';
export type Season = 'winter' | 'spring' | 'summer' | 'fall';

/** Provider key -> that provider's ID for the same title, e.g. { anilist: '1535', mal: '1535', kitsu: '1376' }. */
export type ExternalIds = Record<string, string>;

export type Attribution = {
  providerId: string;
  displayName: string;
  /** Text shown in the UI. */
  text: string;
  url: string;
  termsUrl: string;
  license: string | null;
  /** What the provider's terms require of KAIRO, in plain words. Shown in docs/PROVIDERS.md. */
  requirements: string[];
};

/** One provider's answer for one title, already normalised to KAIRO's vocabulary. Unknown values are null, never guessed. */
export type NormalizedMetadata = {
  provider: string;
  externalId: string;
  ids: ExternalIds;
  url: string | null;
  title: string | null;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  synonyms: string[];
  synopsis: string | null;
  format: Format | null;
  status: Status | null;
  season: Season | null;
  year: number | null;
  episodeCount: number | null;
  genres: string[];
  posterUrl: string | null;
  bannerUrl: string | null;
  /** Always on a 0-10 scale. Providers that use 0-100 are divided by 10. Never averaged across providers. */
  rating: number | null;
  fetchedAt: string;
};

export type ProviderErrorKind = 'not_found' | 'rate_limited' | 'unavailable' | 'invalid_response';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryAfterSeconds?: number;
  constructor(kind: ProviderErrorKind, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface MetadataProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: { byId: boolean; search: boolean };
  readonly attribution: Attribution;
  /** false = the provider's terms have not been read and confirmed by the owner; it must stay off by default. */
  readonly termsVerified: boolean;
  fetchById(externalId: string, signal: AbortSignal): Promise<NormalizedMetadata>;
  search(title: string, signal: AbortSignal, limit?: number): Promise<NormalizedMetadata[]>;
}

// Episode discovery is a separate service from catalogue metadata and playback.
export type EpisodeLookup = {
  /** Stable KAIRO title id, used only to key short-lived cache entries. */
  cacheKey: string;
  title: string;
  alternateTitles: string[];
  externalIds: ExternalIds;
};

export type EpisodeRecord = {
  episodeNumber: number;
  title: string;
  airedAt: string | null;
  synopsis: string;
  durationSeconds: number | null;
};

export type EpisodePage = { items: EpisodeRecord[]; hasNextPage: boolean; total: number | null };

export interface EpisodeProvider {
  readonly id: string;
  readonly displayName: string;
  /** false until the owner has reviewed the provider's terms and confirmed permitted use. */
  readonly termsVerified: boolean;
  listEpisodes(title: EpisodeLookup, page: number, signal: AbortSignal): Promise<EpisodePage>;
}
// Playback is handled by worker/providers/playback.ts (the authorized-playback boundary).

/** The catalogue row KAIRO already holds, as the starting point for enrichment. */
export type BaseRecord = {
  id: string;
  slug: string;
  provider: string; // who supplied the stored row, e.g. 'manami' or 'catalogue'
  title: string;
  altTitles: string[];
  synopsis: string;
  format: Format | null;
  status: Status | null;
  season: Season | null;
  year: number | null;
  episodeCount: number | null;
  genres: string[];
  posterUrl: string | null;
  bannerUrl: string | null;
  rating: number | null;
  knownIds: ExternalIds;
  updatedAt: string;
};
