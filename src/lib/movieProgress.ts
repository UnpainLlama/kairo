import { apiGet } from './api';
import type { MovieDetail, MovieProgressEntry, MovieSummary, MovieWatchProgress } from './movies';
import { readMovieProgress, writeMovieProgress } from './movieProgressStorage';

type RemoteProgress = {
  providerId: string;
  externalId: string;
  currentTime: number;
  duration: number;
  completed: boolean | number;
  updatedAt: number;
};

function summaryOf(movie: MovieDetail): MovieSummary {
  return {
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
  };
}

function normalizeRemote(value: unknown): RemoteProgress | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const currentTime = Number(row.currentTime);
  const duration = Number(row.duration);
  const updatedAt = Number(row.updatedAt);
  if (
    row.providerId !== 'tmdb' ||
    typeof row.externalId !== 'string' || !/^\d{1,12}$/.test(row.externalId) ||
    !Number.isFinite(currentTime) || currentTime < 0 ||
    !Number.isFinite(duration) || duration <= 0 ||
    !Number.isFinite(updatedAt) || updatedAt <= 0
  ) return null;
  return {
    providerId: 'tmdb',
    externalId: row.externalId,
    currentTime: Math.min(currentTime, duration),
    duration,
    completed: row.completed === true || Number(row.completed) === 1,
    updatedAt,
  };
}

function progressOf(row: RemoteProgress): MovieWatchProgress {
  return {
    currentTime: row.completed ? row.duration : row.currentTime,
    duration: row.duration,
    completed: row.completed === true || Number(row.completed) === 1,
    updatedAt: row.updatedAt,
  };
}

async function pushProgress(movie: MovieSummary, progress: MovieWatchProgress, signal: AbortSignal): Promise<void> {
  await fetch('/api/v1/me/movies/progress', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: movie.providerId,
      externalId: movie.externalId,
      currentTime: progress.currentTime,
      duration: progress.duration,
      completed: progress.completed,
      updatedAt: progress.updatedAt,
    }),
    signal,
  }).then(async response => {
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not sync movie progress.');
  });
}

/**
 * Load one account's most recent progress. A timestamp from a newer local event wins over
 * an older server snapshot; otherwise the server copy is restored to this browser's cache.
 */
export async function loadMovieProgress(
  accountId: string | null,
  signal: AbortSignal,
  limit = 100,
  continueOnly = false,
): Promise<MovieProgressEntry[]> {
  const local = readMovieProgress(accountId);
  if (!accountId) return local.slice(0, limit);

  const response = await fetch('/api/v1/me/movies/progress', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.items)) {
    if (local.length) return local.slice(0, limit);
    throw new Error(payload?.error?.message ?? 'Could not load movie playback progress.');
  }

  const byId = new Map<string, RemoteProgress>();
  for (const value of payload.data.items as unknown[]) {
    const row = normalizeRemote(value);
    if (row) byId.set(row.providerId + ':' + row.externalId, row);
  }

  const localById = new Map(local.map(entry => [entry.providerId + ':' + entry.externalId, entry]));
  for (const entry of local) {
    const key = entry.providerId + ':' + entry.externalId;
    const remote = byId.get(key);
    if (!remote || entry.watchProgress.updatedAt > remote.updatedAt) {
      const progress = entry.watchProgress;
      try {
        await pushProgress(entry, progress, signal);
        byId.set(key, {
          providerId: entry.providerId,
          externalId: entry.externalId,
          currentTime: progress.currentTime,
          duration: progress.duration,
          completed: progress.completed,
          updatedAt: progress.updatedAt,
        });
      } catch {
        if (signal.aborted) return [];
        // Prefer the newer browser snapshot even when syncing fails. The next visit retries it.
        byId.set(key, {
          providerId: entry.providerId,
          externalId: entry.externalId,
          currentTime: progress.currentTime,
          duration: progress.duration,
          completed: progress.completed,
          updatedAt: progress.updatedAt,
        });
      }
    }
  }

  const rows = [...byId.values()]
    .filter(row => !continueOnly || (!row.completed && row.currentTime >= 5))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(limit, 100)));
  const entries: MovieProgressEntry[] = [];
  for (let offset = 0; offset < rows.length; offset += 8) {
    const batch = await Promise.all(rows.slice(offset, offset + 8).map(async row => {
      const cached = localById.get(row.providerId + ':' + row.externalId);
      let summary: MovieSummary | null = cached ?? null;
      if (!summary) {
        try {
          summary = summaryOf(await apiGet<MovieDetail>('/movies/' + encodeURIComponent(row.externalId), signal));
        } catch {
          return null;
        }
      }
      return { ...summary, watchProgress: progressOf(row) } satisfies MovieProgressEntry;
    }));
    entries.push(...batch.filter((entry): entry is MovieProgressEntry => entry !== null));
    if (signal.aborted) return [];
  }

  entries.forEach(entry => {
    const cached = localById.get(entry.providerId + ':' + entry.externalId);
    if (!cached || cached.watchProgress.updatedAt <= entry.watchProgress.updatedAt) {
      writeMovieProgress(accountId, entry, entry.watchProgress);
    }
  });
  return entries;
}


export async function loadMovieProgressForMovie(
  accountId: string | null,
  movie: MovieSummary,
  signal: AbortSignal,
): Promise<MovieWatchProgress | null> {
  const local = readMovieProgress(accountId).find(entry =>
    entry.providerId === movie.providerId && entry.externalId === movie.externalId
  ) ?? null;
  if (!accountId) return local?.watchProgress ?? null;

  const query = new URLSearchParams({ providerId: movie.providerId, externalId: movie.externalId });
  try {
    const response = await fetch('/api/v1/me/movies/progress?' + query.toString(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.items)) {
      return local?.watchProgress ?? null;
    }
    const remote = normalizeRemote(payload.data.items[0]);
    if (local && (!remote || local.watchProgress.updatedAt > remote.updatedAt)) {
      try { await pushProgress(movie, local.watchProgress, signal); } catch { /* keep the local timestamped position */ }
      return local.watchProgress;
    }
    if (!remote) return local?.watchProgress ?? null;
    const progress = progressOf(remote);
    writeMovieProgress(accountId, movie, progress);
    return progress;
  } catch {
    if (signal.aborted) return null;
    return local?.watchProgress ?? null;
  }
}
