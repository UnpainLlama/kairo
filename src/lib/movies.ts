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

export type MoviePage = {
  items: MovieSummary[];
  page: number;
  totalPages: number;
  totalResults: number;
};

export type MovieGenre = { externalId: string; name: string };

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

export function movieHref(movie: Pick<MovieSummary, 'externalId'>): string {
  return '/movies/' + encodeURIComponent(movie.externalId);
}

export function movieYear(movie: Pick<MovieSummary, 'releaseYear' | 'releaseDate'>): string | null {
  if (movie.releaseYear) return String(movie.releaseYear);
  return movie.releaseDate?.slice(0, 4) ?? null;
}

export function movieRating(value: number | null): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value.toFixed(1) : null;
}

export function movieDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function movieGenreHref(genre: MovieGenre): string {
  return '/movies/browse/genre-' + encodeURIComponent(genre.externalId);
}
