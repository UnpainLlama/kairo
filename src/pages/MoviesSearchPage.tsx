import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiGet } from '../lib/api';
import type { MoviePage, MovieSummary } from '../lib/movies';
import { GridSkeleton, MovieGrid, useSentinel } from '../components/MovieCard';
import { TitleModal } from '../components/TitleDetail';
import { MyListProvider } from '../lib/useMyList';
import '../styles-netflix.css';

function SearchContent({ query }: { query: string }) {
  const [items, setItems] = useState<MovieSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(query.length > 0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    if (page === 1) setLoading(true); else setMore(true);
    setError(null);
    apiGet<MoviePage>('/movies/search?' + new URLSearchParams({ q: query, page: String(page) }).toString(), controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setTotalPages(Math.min(result.totalPages, 500));
        setItems(previous => {
          if (page === 1) return result.items;
          const seen = new Set(previous.map(item => item.externalId));
          return [...previous, ...result.items.filter(item => !seen.has(item.externalId))];
        });
      })
      .catch(caught => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Search is unavailable.'));
      })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setMore(false); } });
    return () => controller.abort();
  }, [query, page, retry]);

  const sentinel = useSentinel(() => setPage(current => current + 1), !!query && !loading && !more && !error && page < totalPages && items.length > 0, items.length);

  return (
    <div className="nf nf-bleed nf-page">
      {query && !error && !loading && items.length > 0 && <p className="nf-search-line">Explore titles related to: <b>{query}</b></p>}
      {!query && (
        <div className="nf-message">
          <h2>Search for movies</h2>
          <p>Use the search bar above to find a title, an actor or a keyword.</p>
          <Link to="/movies/browse/trending" className="nf-btn play">See what&apos;s trending</Link>
        </div>
      )}
      {error && (
        <div className="nf-message" role="alert">
          <h2>Something went wrong</h2>
          <p>{error.message}</p>
          <button type="button" className="nf-btn play" onClick={() => setRetry(value => value + 1)}>Try again</button>
        </div>
      )}
      {query && loading && <GridSkeleton count={12} />}
      {query && !loading && !error && items.length > 0 && <MovieGrid items={items} />}
      {query && !loading && !error && items.length === 0 && (
        <div className="nf-message nf-nomatch">
          <p>Your search for &ldquo;{query}&rdquo; did not have any matches.</p>
          <p className="nf-sub">Suggestions:</p>
          <ul><li>Try different keywords</li><li>Looking for a movie? Search by its title</li><li>Try an actor or a director</li></ul>
        </div>
      )}
      {more && <GridSkeleton count={6} />}
      <div ref={sentinel} className="nf-sentinel" />
    </div>
  );
}

export default function MoviesSearchPage() {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim().slice(0, 120);
  return (
    <MyListProvider>
      <SearchContent key={query} query={query} />
      <TitleModal />
    </MyListProvider>
  );
}
