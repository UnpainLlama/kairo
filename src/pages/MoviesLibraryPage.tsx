import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountScope } from '../hooks/useAccountScope';
import { apiGet } from '../lib/api';
import { readMovieLibrary } from '../lib/movieLibraryStorage';
import type { MovieDetail, MovieSummary } from '../lib/movies';
import { MyListProvider, useMyList } from '../lib/useMyList';
import { GridSkeleton, MovieGrid } from '../components/MovieCard';
import { TitleModal } from '../components/TitleDetail';
import '../styles-netflix.css';

type Filter = 'all' | 'watchlist' | 'watched' | 'liked';
type RemoteEntry = { providerId: string; externalId: string };

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
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

async function loadRemoteMovies(items: RemoteEntry[], signal: AbortSignal): Promise<{ movies: MovieSummary[]; missing: number }> {
  const refs = items.filter(item => item.providerId === 'tmdb' && /^\d{1,12}$/.test(item.externalId)).slice(0, 200);
  const movies: MovieSummary[] = [];
  for (let offset = 0; offset < refs.length; offset += 8) {
    const loaded = await Promise.all(refs.slice(offset, offset + 8).map(ref =>
      apiGet<MovieDetail>('/movies/' + encodeURIComponent(ref.externalId), signal).then(summaryOf).catch(() => null)));
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
    if (!accountId) {
      setMovies(readMovieLibrary(null));
      setLoading(false);
      return () => controller.abort();
    }
    fetch('/api/v1/me/movies/library', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.items)) throw new Error(payload?.error?.message ?? 'Could not load your list.');
        return loadRemoteMovies(payload.data.items as RemoteEntry[], controller.signal);
      })
      .then(result => {
        if (controller.signal.aborted) return;
        setMovies(result.movies);
        if (result.missing > 0) setLoadError(result.missing + ' saved title(s) could not be loaded right now. They are still saved to your account.');
      })
      .catch(caught => { if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : 'Could not load your list.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accountId, resolved, error]);

  const saved = useMemo(() => movies.filter(movie => { const state = list.get(movie); return state.status !== null || state.isFavorite; }), [movies, list]);
  const visible = useMemo(() => saved.filter(movie => {
    const state = list.get(movie);
    if (filter === 'watchlist') return state.status === 'watchlist';
    if (filter === 'watched') return state.status === 'watched';
    if (filter === 'liked') return state.isFavorite;
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
      {loadError && <p className="nf-detail-note" role="alert">{loadError}</p>}

      {resolved && !error && !loading && visible.length > 0 && <MovieGrid items={visible} onRemove={movie => void list.update(movie, { status: null, isFavorite: false })} />}
      {resolved && !error && !loading && visible.length === 0 && (
        <div className="nf-message">
          <h2>{saved.length === 0 ? "You haven't added any titles to your list yet." : 'Nothing here yet.'}</h2>
          <p>{saved.length === 0 ? 'Add titles with the + button and they will show up here.' : 'Pick another tab, or save more titles.'}</p>
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
