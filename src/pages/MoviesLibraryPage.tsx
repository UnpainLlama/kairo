import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountScope } from '../hooks/useAccountScope';
import { apiGet } from '../lib/api';
import { readMovieLibrary, removeMovieFromLibrary } from '../lib/movieLibraryStorage';
import { readMovieProgress, removeMovieProgress, writeMovieProgress } from '../lib/movieProgressStorage';
import type { MovieDetail, MovieProgressEntry, MovieSummary, MovieWatchProgress } from '../lib/movies';
import { MyListProvider, useMyList } from '../lib/useMyList';
import { GridSkeleton, MovieGrid } from '../components/MovieCard';
import { TitleModal } from '../components/TitleDetail';
import '../styles-netflix.css';

type Filter = 'all' | 'continue' | 'watchlist' | 'watched' | 'liked';
type RemoteEntry = { providerId: string; externalId: string };
type RemoteProgress = RemoteEntry & {
  currentTime: number;
  duration: number;
  completed: boolean | number;
  updatedAt: number;
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'continue', label: 'Continue Watching' },
  { id: 'watchlist', label: 'My List' },
  { id: 'watched', label: 'Watched' },
  { id: 'liked', label: 'Liked' },
];

function summaryOf(movie: MovieDetail): MovieSummary {
  return {
    providerId: movie.providerId, externalId: movie.externalId, title: movie.title, originalTitle: movie.originalTitle,
    overview: movie.overview, releaseDate: movie.releaseDate, releaseYear: movie.releaseYear, originalLanguage: movie.originalLanguage,
    posterUrl: movie.posterUrl, backdropUrl: movie.backdropUrl, voteAverage: movie.voteAverage, voteCount: movie.voteCount,
    popularity: movie.popularity, adult: movie.adult,
  };
}

function progressOf(row: RemoteProgress): MovieWatchProgress | null {
  const currentTime = Number(row.currentTime);
  const duration = Number(row.duration);
  const updatedAt = Number(row.updatedAt);
  if (!Number.isFinite(currentTime) || currentTime < 0 || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(updatedAt)) return null;
  const completed = row.completed === true || Number(row.completed) === 1;
  return { currentTime: completed ? duration : Math.min(currentTime, duration), duration, completed, updatedAt };
}

function identity(entry: RemoteEntry): string {
  return entry.providerId + ':' + entry.externalId;
}

async function loadRemoteMovies(items: RemoteEntry[], signal: AbortSignal, cached: MovieProgressEntry[]): Promise<{ movies: MovieSummary[]; missing: number }> {
  const unique = new Map<string, RemoteEntry>();
  items.filter(item => item.providerId === 'tmdb' && /^\d{1,12}$/.test(item.externalId)).forEach(item => unique.set(identity(item), item));
  const refs = [...unique.values()].slice(0, 100);
  const cachedById = new Map(cached.map(item => [identity(item), item]));
  const movies: MovieSummary[] = [];
  for (let offset = 0; offset < refs.length; offset += 8) {
    const loaded = await Promise.all(refs.slice(offset, offset + 8).map(async ref => {
      const saved = cachedById.get(identity(ref));
      if (saved) return saved;
      try {
        return summaryOf(await apiGet<MovieDetail>('/movies/' + encodeURIComponent(ref.externalId), signal));
      } catch {
        return null;
      }
    }));
    movies.push(...loaded.filter((movie): movie is MovieSummary => movie !== null));
    if (signal.aborted) break;
  }
  return { movies, missing: refs.length - movies.length };
}

function LibraryContent() {
  const { accountId, resolved, error, retry } = useAccountScope();
  const list = useMyList();
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!resolved || error) return;
    const controller = new AbortController();
    setMovies([]);
    setLoading(true);
    setLoadError('');

    const load = async () => {
      try {
        if (!accountId) {
          const saved = readMovieLibrary(null);
          const progress = readMovieProgress(null);
          const merged = new Map<string, MovieSummary>();
          saved.forEach(movie => merged.set(identity(movie), movie));
          progress.forEach(entry => {
            const previous = merged.get(identity(entry));
            merged.set(identity(entry), { ...(previous ?? entry), watchProgress: entry.watchProgress });
          });
          if (!controller.signal.aborted) setMovies([...merged.values()]);
          return;
        }

        const [libraryResponse, progressResponse] = await Promise.all([
          fetch('/api/v1/me/movies/library', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal }).catch(() => null),
          fetch('/api/v1/me/movies/progress', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal }).catch(() => null),
        ]);
        let libraryRefs: RemoteEntry[] = [];
        let libraryError = '';
        if (libraryResponse?.ok) {
          const libraryPayload = await libraryResponse.json().catch(() => null);
          if (libraryPayload?.success && Array.isArray(libraryPayload?.data?.items)) {
            libraryRefs = libraryPayload.data.items as RemoteEntry[];
          } else {
            libraryError = libraryPayload?.error?.message ?? 'Your saved Movies list could not be refreshed.';
          }
        } else {
          libraryError = 'Your saved Movies list could not be reached. Playback history is still shown when available.';
        }

        const localProgress = readMovieProgress(accountId);
        let progressRows: RemoteProgress[] = [];
        let partialProgressError = '';
        if (progressResponse?.ok) {
          const payload = await progressResponse.json().catch(() => null);
          if (payload?.success && Array.isArray(payload?.data?.items)) {
            progressRows = (payload.data.items as RemoteProgress[]).filter(row => row.providerId === 'tmdb' && /^\d{1,12}$/.test(row.externalId));
          } else {
            partialProgressError = 'Playback progress could not be refreshed. Showing locally cached progress.';
          }
        } else {
          partialProgressError = 'Playback progress could not be refreshed. Showing locally cached progress.';
        }

        const progressById = new Map(localProgress.map(entry => [identity(entry), entry.watchProgress]));
        progressRows.forEach(row => {
          const id = identity(row);
          const progress = progressOf(row);
          if (!progress) return;
          const previous = progressById.get(id);
          if (!previous || previous.updatedAt <= progress.updatedAt) {
            progressById.set(id, progress);
            const cached = localProgress.find(entry => identity(entry) === id);
            if (cached) writeMovieProgress(accountId, cached, progress);
          }
        });
        const refs = [
          ...libraryRefs,
          ...progressRows,
          ...localProgress,
        ];
        const result = await loadRemoteMovies(refs, controller.signal, localProgress);
        if (controller.signal.aborted) return;
        const enriched = result.movies.map(movie => {
          const progress = progressById.get(identity(movie));
          return progress ? { ...movie, watchProgress: progress } : movie;
        });
        enriched.forEach(movie => {
          if (movie.watchProgress) writeMovieProgress(accountId, movie, movie.watchProgress);
        });
        setMovies(enriched);
        const messages = [
          libraryError,
          result.missing > 0 ? result.missing + ' saved or watched title(s) could not be loaded right now.' : '',
          partialProgressError,
        ].filter(Boolean);
        if (messages.length) setLoadError(messages.join(' '));
      } catch (caught) {
        if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : 'Could not load your Movies list.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [accountId, resolved, error]);

  const removeMovie = async (movie: MovieSummary) => {
    setLoadError('');
    try {
      if (accountId) {
        const [libraryResponse, progressResponse] = await Promise.all([
          fetch('/api/v1/me/movies/library/tmdb/' + encodeURIComponent(movie.externalId), {
            method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' },
          }),
          fetch('/api/v1/me/movies/progress/tmdb/' + encodeURIComponent(movie.externalId), {
            method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' },
          }),
        ]);
        const [libraryPayload, progressPayload] = await Promise.all([
          libraryResponse.json().catch(() => null),
          progressResponse.json().catch(() => null),
        ]);
        if (!libraryResponse.ok || !libraryPayload?.success) {
          throw new Error(libraryPayload?.error?.message ?? 'Could not remove this movie from your list.');
        }
        if (!progressResponse.ok || !progressPayload?.success) {
          throw new Error(progressPayload?.error?.message ?? 'Could not remove this movie’s playback progress.');
        }
      }
      removeMovieFromLibrary(accountId, movie.providerId, movie.externalId);
      removeMovieProgress(accountId, movie.providerId, movie.externalId);
      setMovies(current => current.filter(item => identity(item) !== identity(movie)));
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Could not remove this movie.');
    }
  };

  const saved = useMemo(() => movies.filter(movie => {
    const state = list.get(movie);
    return state.status !== null || state.isFavorite || Boolean(movie.watchProgress);
  }), [movies, list]);
  const visible = useMemo(() => saved.filter(movie => {
    const state = list.get(movie);
    const progress = movie.watchProgress;
    if (filter === 'watchlist') return state.status === 'watchlist';
    if (filter === 'watched') return state.status === 'watched' || progress?.completed === true;
    if (filter === 'liked') return state.isFavorite;
    if (filter === 'continue') return Boolean(progress && !progress.completed && progress.currentTime >= 5);
    return true;
  }), [saved, filter, list]);

  return (
    <div className="nf nf-bleed nf-page">
      <header className="nf-page-head">
        <h1>My List</h1>
        <div className="nf-chips" role="group" aria-label="Filter your titles">
          {FILTERS.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
        </div>
      </header>

      {error && (
        <div className="nf-message" role="alert">
          <h2>Something went wrong</h2>
          <p>We could not verify your account, so your list is locked.</p>
          <button type="button" className="nf-btn play" onClick={retry}>Try again</button>
        </div>
      )}
      {(!resolved && !error) || (loading && !error) ? <GridSkeleton count={12} /> : null}
      {list.error && <p className="nf-detail-note" role="alert">{list.error} <button type="button" onClick={list.retry}>Retry</button></p>}
      {loadError && <p className="nf-detail-note" role="alert">{loadError}</p>}

      {resolved && !error && !loading && visible.length > 0 && <MovieGrid items={visible} onRemove={movie => void removeMovie(movie)} />}
      {resolved && !error && !loading && !loadError && visible.length === 0 && (
        <div className="nf-message">
          <h2>{saved.length === 0 ? "You haven't added or watched any titles yet." : 'Nothing here yet.'}</h2>
          <p>{saved.length === 0 ? 'Add titles to My List or start watching a movie to keep your progress here.' : 'Pick another filter, or browse more titles.'}</p>
          <Link to="/movies" className="nf-btn play">Browse titles</Link>
        </div>
      )}
    </div>
  );
}

export default function MoviesLibraryPage() {
  return (
    <MyListProvider>
      <LibraryContent />
      <TitleModal />
    </MyListProvider>
  );
}
