/**
 * Movies is a standalone domain. These contracts deliberately do not reuse Anime's
 * LiveTitle, CatalogSource, EpisodeProvider, or playback types.
 */
export type MovieListKind = 'trending_day' | 'trending_week' | 'popular' | 'top_rated' | 'upcoming' | 'now_playing';

export type MovieDiscoverQuery = {
  kind: MovieListKind;
  page: number;
  year?: number;
  genreIds?: string[];
  originalLanguage?: string;
  includeAdult?: boolean;
};

export type MovieSearchQuery = {
  query: string;
  page: number;
  year?: number;
  includeAdult?: boolean;
  language?: string;
};

export type MovieGenre = { externalId: string; name: string };

export type MovieSummary = {
  providerId: string;
  externalId: string;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string | null;
  releaseYear: number | null;
  originalLanguage: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number | null;
  voteCount: number;
  popularity: number;
  adult: boolean;
};

export type MovieCredit = {
  externalPersonId: string | null;
  name: string;
  department: string | null;
  job: string | null;
  character: string | null;
  profileUrl: string | null;
  order: number;
};

export type MovieDetail = MovieSummary & {
  tagline: string;
  runtimeMinutes: number | null;
  releaseStatus: string | null;
  homepageUrl: string | null;
  imdbId: string | null;
  genres: MovieGenre[];
  productionCountries: { code: string; name: string }[];
  spokenLanguages: { code: string; name: string; englishName: string | null }[];
  cast: MovieCredit[];
  crew: MovieCredit[];
};

export type MoviePage = { items: MovieSummary[]; page: number; totalPages: number; totalResults: number };

export type MovieProviderAttribution = {
  providerId: string;
  displayName: string;
  text: string;
  url: string;
  termsUrl: string;
  requirements: string[];
};

export interface MovieCatalogProvider {
  readonly id: string;
  readonly displayName: string;
  readonly termsVerified: boolean;
  readonly attribution: MovieProviderAttribution;
  discover(query: MovieDiscoverQuery, signal: AbortSignal): Promise<MoviePage>;
  search(query: MovieSearchQuery, signal: AbortSignal): Promise<MoviePage>;
  byId(externalId: string, signal: AbortSignal): Promise<MovieDetail>;
  genres(language: string, signal: AbortSignal): Promise<MovieGenre[]>;
}

export type MovieMonetizationType = 'flatrate' | 'rent' | 'buy' | 'ads' | 'free' | 'none';
export type MovieAvailabilityOffer = {
  regionCode: string;
  serviceId: string | null;
  serviceName: string;
  monetizationType: MovieMonetizationType;
  presentationType: string | null;
  priceAmount: number | null;
  currency: string | null;
  targetUrl: string;
  sourcePageUrl: string | null;
  fetchedAt: string;
};

/** Availability is separate from the catalogue and is never a playable stream URL. */
export interface MovieAvailabilityProvider {
  readonly id: string;
  readonly displayName: string;
  readonly termsVerified: boolean;
  offersByMovieId(tmdbMovieId: string, locale: string, signal: AbortSignal): Promise<MovieAvailabilityOffer[]>;
}

// Reuse the platform's provider-neutral error class, not any Anime catalogue types.
export { ProviderError as MovieProviderError } from '../metadata/types';
