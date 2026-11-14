import type { MovieSummary } from './movies';

export type MovieLibraryStatus = 'watchlist' | 'watched';
export type MovieLibraryEntry = MovieSummary & {
  status: MovieLibraryStatus | null;
  isFavorite: boolean;
  addedAt: number;
  updatedAt: number;
};

export type MovieLibraryPatch = {
  status?: MovieLibraryStatus | null;
  isFavorite?: boolean;
};

const KEY_PREFIX = 'kairo-movies-library:v1:';
const MAX_ENTRIES = 500;

function storageKey(accountId: string | null): string {
  const scope = accountId?.trim() || 'guest';
  return KEY_PREFIX + encodeURIComponent(scope);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeEntry(value: unknown): MovieLibraryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.providerId !== 'string' || !row.providerId.trim() ||
    typeof row.externalId !== 'string' || !row.externalId.trim() ||
    typeof row.title !== 'string' || !row.title.trim() ||
    typeof row.originalTitle !== 'string' ||
    typeof row.overview !== 'string' ||
    typeof row.voteCount !== 'number' || !Number.isFinite(row.voteCount) ||
    typeof row.popularity !== 'number' || !Number.isFinite(row.popularity) ||
    typeof row.adult !== 'boolean' ||
    (row.status !== null && row.status !== 'watchlist' && row.status !== 'watched') ||
    typeof row.isFavorite !== 'boolean' ||
    typeof row.addedAt !== 'number' || !Number.isFinite(row.addedAt) ||
    typeof row.updatedAt !== 'number' || !Number.isFinite(row.updatedAt)
  ) return null;

  const releaseYear = row.releaseYear === null ? null : finiteOrNull(row.releaseYear);
  const voteAverage = row.voteAverage === null ? null : finiteOrNull(row.voteAverage);
  if (row.releaseYear !== null && (releaseYear === null || !Number.isInteger(releaseYear))) return null;
  if (row.voteAverage !== null && voteAverage === null) return null;

  return {
    providerId: row.providerId,
    externalId: row.externalId,
    title: row.title,
    originalTitle: row.originalTitle,
    overview: row.overview,
    releaseDate: optionalString(row.releaseDate),
    releaseYear,
    originalLanguage: optionalString(row.originalLanguage),
    posterUrl: optionalString(row.posterUrl),
    backdropUrl: optionalString(row.backdropUrl),
    voteAverage,
    voteCount: row.voteCount,
    popularity: row.popularity,
    adult: row.adult,
    status: row.status as MovieLibraryStatus | null,
    isFavorite: row.isFavorite,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt,
  };
}

function writeEntries(accountId: string | null, entries: MovieLibraryEntry[]): void {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Browser storage can be disabled or full; movie discovery must keep working.
  }
}

function notifyChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('kairo:movie-library-change'));
  }
}

/** Read the local Movies list for one signed-in account, or the isolated guest scope. */
export function readMovieLibrary(accountId: string | null): MovieLibraryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is MovieLibraryEntry => entry !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Add/update a Watchlist, Watched or Favorite state without relying on server persistence. */
export function updateMovieLibraryEntry(
  accountId: string | null,
  movie: MovieSummary,
  patch: MovieLibraryPatch,
): MovieLibraryEntry | null {
  const entries = readMovieLibrary(accountId);
  const index = entries.findIndex((entry) =>
    entry.providerId === movie.providerId && entry.externalId === movie.externalId
  );
  const previous = index >= 0 ? entries[index] : null;
  const status = patch.status === undefined ? previous?.status ?? null : patch.status;
  const isFavorite = patch.isFavorite === undefined ? previous?.isFavorite ?? false : patch.isFavorite;

  const nextEntries = entries.filter((entry) =>
    entry.providerId !== movie.providerId || entry.externalId !== movie.externalId
  );

  if (status === null && !isFavorite) {
    writeEntries(accountId, nextEntries);
    notifyChanged();
    return null;
  }

  const now = Date.now();
  const next: MovieLibraryEntry = {
    providerId: movie.providerId,
    externalId: movie.externalId,
    title: movie.title,
    originalTitle: movie.originalTitle,
    overview: movie.overview,
    releaseDate: movie.releaseDate,
    releaseYear: movie.releaseYear,
    originalLanguage: movie.originalLanguage,
    posterUrl: movie.posterUrl,
    backdropUrl: movie.backdropUrl,
    voteAverage: movie.voteAverage,
    voteCount: movie.voteCount,
    popularity: movie.popularity,
    adult: movie.adult,
    status,
    isFavorite,
    addedAt: previous?.addedAt ?? now,
    updatedAt: now,
  };
  nextEntries.unshift(next);
  writeEntries(accountId, nextEntries);
  notifyChanged();
  return next;
}

/** Remove one locally saved movie from the selected account/guest namespace. */
export function removeMovieFromLibrary(
  accountId: string | null,
  providerId: string,
  externalId: string,
): void {
  const next = readMovieLibrary(accountId).filter((entry) =>
    entry.providerId !== providerId || entry.externalId !== externalId
  );
  writeEntries(accountId, next);
  notifyChanged();
}
