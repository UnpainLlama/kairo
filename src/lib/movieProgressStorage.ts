import { dispatchBrowserChange, readBrowserJson, writeBrowserJson } from './browserPersistence';
import type { MovieProgressEntry, MovieSummary, MovieWatchProgress } from './movies';

const KEY_PREFIX = 'kairo-movie-progress:v1:';
const MAX_ENTRIES = 100;
export const MOVIE_PROGRESS_CHANGE = 'kairo:movie-progress-change';

function storageKey(accountId: string | null): string {
  const scope = accountId?.trim() || 'guest';
  return KEY_PREFIX + encodeURIComponent(scope);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalize(value: unknown): MovieProgressEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const progress = row.watchProgress as Record<string, unknown> | undefined;
  if (
    typeof row.providerId !== 'string' || !row.providerId.trim() ||
    typeof row.externalId !== 'string' || !/^\d{1,12}$/.test(row.externalId) ||
    typeof row.title !== 'string' || !row.title.trim() ||
    typeof row.originalTitle !== 'string' ||
    typeof row.overview !== 'string' ||
    !finite(row.voteCount) || !finite(row.popularity) ||
    typeof row.adult !== 'boolean' ||
    !progress || !finite(progress.currentTime) || progress.currentTime < 0 ||
    !finite(progress.duration) || progress.duration <= 0 ||
    !finite(progress.updatedAt) || progress.updatedAt <= 0 ||
    typeof progress.completed !== 'boolean'
  ) return null;

  const releaseYear = row.releaseYear === null ? null : finite(row.releaseYear) ? row.releaseYear : null;
  const voteAverage = row.voteAverage === null ? null : finite(row.voteAverage) ? row.voteAverage : null;
  if (row.releaseYear !== null && (releaseYear === null || !Number.isInteger(releaseYear))) return null;
  if (row.voteAverage !== null && voteAverage === null) return null;

  const watchProgress: MovieWatchProgress = {
    currentTime: Math.min(progress.currentTime, progress.duration),
    duration: progress.duration,
    updatedAt: progress.updatedAt,
    completed: progress.completed,
  };
  return {
    providerId: row.providerId,
    externalId: row.externalId,
    title: row.title,
    originalTitle: row.originalTitle,
    overview: row.overview,
    releaseDate: typeof row.releaseDate === 'string' ? row.releaseDate : null,
    releaseYear,
    originalLanguage: typeof row.originalLanguage === 'string' ? row.originalLanguage : null,
    posterUrl: typeof row.posterUrl === 'string' ? row.posterUrl : null,
    backdropUrl: typeof row.backdropUrl === 'string' ? row.backdropUrl : null,
    voteAverage,
    voteCount: row.voteCount,
    popularity: row.popularity,
    adult: row.adult,
    watchProgress,
  };
}

export function readMovieProgress(accountId: string | null): MovieProgressEntry[] {
  const parsed = readBrowserJson<unknown>(storageKey(accountId), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalize)
    .filter((entry): entry is MovieProgressEntry => entry !== null)
    .sort((a, b) => b.watchProgress.updatedAt - a.watchProgress.updatedAt)
    .slice(0, MAX_ENTRIES);
}

export function writeMovieProgress(
  accountId: string | null,
  movie: MovieSummary,
  progress: MovieWatchProgress,
): MovieProgressEntry {
  const duration = Math.max(0, Math.min(progress.duration, 108000));
  const currentTime = Math.max(0, Math.min(progress.currentTime, duration));
  const entry: MovieProgressEntry = {
    ...movie,
    watchProgress: {
      currentTime: progress.completed ? duration : currentTime,
      duration,
      updatedAt: progress.updatedAt,
      completed: progress.completed,
    },
  };
  const entries = readMovieProgress(accountId).filter(item =>
    item.providerId !== movie.providerId || item.externalId !== movie.externalId
  );
  entries.unshift(entry);
  writeBrowserJson(storageKey(accountId), entries.slice(0, MAX_ENTRIES));
  dispatchBrowserChange(MOVIE_PROGRESS_CHANGE);
  return entry;
}

export function removeMovieProgress(accountId: string | null, providerId: string, externalId: string): void {
  const entries = readMovieProgress(accountId).filter(item =>
    item.providerId !== providerId || item.externalId !== externalId
  );
  writeBrowserJson(storageKey(accountId), entries);
  dispatchBrowserChange(MOVIE_PROGRESS_CHANGE);
}
