import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ArrowRight, RefreshCw } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import type { MoviePage, MovieSummary } from '../lib/movies';
import MovieCard from '../components/MovieCard';

export default function MoviesSearchPage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim().slice(0, 120);
  const page = Math.max(1, Math.min(500, Number(params.get('page') ?? 1) || 1));
  const [data, setData] = useState<MoviePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (query.length < 1) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const search = new URLSearchParams({ q: query, page: String(page) });
    apiGet<MoviePage>('/movies/search?' + search.toString(), controller.signal)
      .then(setData)
      .catch(caught => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Movie search is unavailable.'));
        setData(null);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query, page, retry]);

  return (
    <section className="mv-page mv-search-page">
      <header className="mv-page-heading">
        <span className="mv-eyebrow"><Search size={12} /> GLOBAL MOVIE SEARCH</span>
        <h1>{query ? 'Results for “' + query + '”' : 'Find your next film.'}</h1>
        <p>{query ? 'Searching films from around the world.' : 'Use the persistent search bar above to find a title, actor or story.'}</p>
      </header>
      {loading && <div className="mv-browse-grid" role="status" aria-label="Searching movies">{Array.from({length:12},(_,index)=><div className="mv-skeleton" key={index}><span /><i /></div>)}</div>}
      {error && <div className="mv-provider-notice" role="alert"><div><b>{error.code === 'MOVIES_DISABLED' ? 'Global movie search is not enabled yet' : 'Search could not be completed'}</b><p>{error.message}</p></div><button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} /> Retry</button></div>}
      {!loading && data && (
        <>
          <div className="mv-results-meta"><span>{data.totalResults.toLocaleString()} results</span><span>Page {data.page} of {Math.max(1,data.totalPages)}</span></div>
          {data.items.length > 0
            ? <div className="mv-browse-grid">{data.items.map((movie: MovieSummary)=><MovieCard key={movie.providerId + ':' + movie.externalId} movie={movie} />)}</div>
            : <div className="mv-empty-state"><h2>No films found for “{query}”.</h2><p>Try a different title or a broader search.</p><Link to="/movies">Back to Movies <ArrowRight size={14} /></Link></div>}
          <nav className="mv-pager" aria-label="Movie search pages">
            <button type="button" disabled={page <= 1} onClick={() => setParams(current => { const next=new URLSearchParams(current); next.set('page',String(page-1)); return next; })}>Previous</button>
            <span>{page} / {Math.max(1,Math.min(data.totalPages,500))}</span>
            <button type="button" disabled={page >= data.totalPages || !data.items.length} onClick={() => setParams(current => { const next=new URLSearchParams(current); next.set('page',String(page+1)); return next; })}>Next</button>
          </nav>
        </>
      )}
      {!query && <div className="mv-empty-state"><h2>What are you in the mood for?</h2><p>Search by title from the bar at the top of every Kairo page.</p><Link to="/movies/browse/trending">Explore trending films <ArrowRight size={14} /></Link></div>}
    </section>
  );
}
