import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Filter, RefreshCw } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import type { MovieGenre, MoviePage as MoviePageData, MovieSummary } from '../lib/movies';
import MovieCard from '../components/MovieCard';

const CATEGORIES: Record<string, { title: string; kind: string; description: string }> = {
  trending: { title: 'Trending movies', kind: 'trending_week', description: 'What the world is watching and talking about.' },
  popular: { title: 'Popular movies', kind: 'popular', description: 'Global favourites, across every genre and era.' },
  'top-rated': { title: 'Top rated movies', kind: 'top_rated', description: 'Highly rated films from around the world.' },
  upcoming: { title: 'Coming soon', kind: 'upcoming', description: 'Films on the way to cinemas and screens.' },
  'now-playing': { title: 'Now playing', kind: 'now_playing', description: 'Recent releases making their debut.' },
};

export default function MoviesBrowsePage() {
  const { category = 'popular' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.min(500, Number(params.get('page') ?? 1) || 1));
  const [data, setData] = useState<MoviePageData | null>(null);
  const [genres, setGenres] = useState<MovieGenre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [retry, setRetry] = useState(0);

  const genreId = category.startsWith('genre-') ? category.slice(6) : null;
  const validGenreId = genreId && /^\d{1,8}$/.test(genreId) ? genreId : null;
  const details = CATEGORIES[category] ?? (validGenreId
    ? { title: 'Explore by genre', kind: 'popular', description: 'A collection selected by genre.' }
    : { title: 'Movie discovery', kind: 'popular', description: 'Explore movies from across the world.' });
  const selectedGenre = useMemo(() => genres.find(genre => genre.externalId === validGenreId), [genres, validGenreId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ kind: details.kind, page: String(page) });
    if (validGenreId) query.set('genres', validGenreId);
    apiGet<MoviePageData>('/movies/discover?' + query.toString(), controller.signal)
      .then(setData)
      .catch(caught => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load this collection.'));
        setData(null);
      })
      .finally(() => setLoading(false));
    if (validGenreId) {
      apiGet<{ items: MovieGenre[] }>('/movies/genres?language=en-US', controller.signal)
        .then(result => setGenres(result.items))
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [details.kind, page, validGenreId, retry]);

  const title = selectedGenre?.name ? selectedGenre.name + ' movies' : details.title;
  const totalPages = Math.max(1, Math.min(data?.totalPages ?? 1, 500));

  return (
    <section className="mv-page mv-browse-page">
      <Link to="/movies" className="mv-back-link"><ArrowLeft size={14} /> Movies home</Link>
      <header className="mv-page-heading">
        <span className="mv-eyebrow"><Filter size={12} /> MOVIE COLLECTION</span>
        <h1>{title}</h1>
        <p>{selectedGenre?.name ? 'Discover ' + selectedGenre.name.toLowerCase() + ' films from around the world.' : details.description}</p>
      </header>

      {error && <div className="mv-provider-notice" role="alert"><div><b>{error.code === 'MOVIES_DISABLED' ? 'Movie catalogue not enabled yet' : 'Could not load this collection'}</b><p>{error.message}</p></div><button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} /> Retry</button></div>}
      {loading && <div className="mv-browse-grid" role="status" aria-label="Loading movies">{Array.from({length:18},(_,index)=><div className="mv-skeleton" key={index}><span /><i /></div>)}</div>}
      {!loading && data && (
        <>
          <div className="mv-results-meta"><span>{data.totalResults.toLocaleString()} titles</span><span>Page {data.page} of {Math.max(1,data.totalPages)}</span></div>
          {data.items.length > 0
            ? <div className="mv-browse-grid">{data.items.map(movie => <MovieCard key={movie.providerId + ':' + movie.externalId} movie={movie} />)}</div>
            : <div className="mv-empty-state"><h2>No movies in this collection yet.</h2><p>Try another category or search for a specific title.</p><Link to="/movies/search">Search movies <ChevronRight size={14} /></Link></div>}
          <nav className="mv-pager" aria-label="Movie collection pages">
            <button type="button" disabled={page <= 1} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('page', String(page - 1)); return next; })}><ChevronLeft size={16} /> Previous</button>
            <span>{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages || !data.items.length} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('page', String(page + 1)); return next; })}>Next <ChevronRight size={16} /></button>
          </nav>
        </>
      )}
    </section>
  );
}
