import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import type { MovieGenre, MoviePage as MoviePageData, MovieSummary } from '../lib/movies';
import { GridSkeleton, MovieGrid, useSentinel } from '../components/MovieCard';
import { TitleModal } from '../components/TitleDetail';
import { NotFoundPage } from './StaticPages';
import { MyListProvider } from '../lib/useMyList';
import '../styles-netflix.css';

const CATEGORIES: Record<string, { title: string; kind: string }> = {
  trending: { title: 'Trending Now', kind: 'trending_week' },
  popular: { title: 'Popular Movies', kind: 'popular' },
  'top-rated': { title: 'Top Rated', kind: 'top_rated' },
  upcoming: { title: 'Coming Soon', kind: 'upcoming' },
  'now-playing': { title: 'New Releases', kind: 'now_playing' },
};

function GenreMenu({ genres, activeId }: { genres: MovieGenre[]; activeId: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!genres.length) return null;
  return (
    <div className="nf-genre" ref={ref}>
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        Genres <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="nf-genre-menu" role="menu">
          <Link role="menuitem" to="/movies/browse/popular" className={!activeId ? 'on' : ''} onClick={() => setOpen(false)}>All Genres</Link>
          {genres.map(genre => (
            <Link role="menuitem" key={genre.externalId} to={'/movies/browse/genre-' + genre.externalId} className={genre.externalId === activeId ? 'on' : ''} onClick={() => setOpen(false)}>{genre.name}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

function BrowseContent({ category }: { category: string }) {
  const genreRaw = category.startsWith('genre-') ? category.slice(6) : null;
  const genreId = genreRaw && /^\d{1,8}$/.test(genreRaw) ? genreRaw : null;
  const config = CATEGORIES[category] ?? null;
  const validRoute = config !== null || genreId !== null;
  const [items, setItems] = useState<MovieSummary[]>([]);
  const [genres, setGenres] = useState<MovieGenre[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPage = Number(searchParams.get('page'));
  const page = Number.isInteger(rawPage) && rawPage > 1 ? Math.min(rawPage, 500) : 1;
  const restoring = useRef(true);
  const setPage = (nextPage: number) => setSearchParams(current => {
    const next = new URLSearchParams(current);
    const safePage = Math.max(1, Math.min(500, Math.trunc(nextPage)));
    if (safePage === 1) next.delete('page'); else next.set('page', String(safePage));
    return next;
  }, { replace: true });
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!validRoute) return;
    const controller = new AbortController();
    apiGet<{ items: MovieGenre[] }>('/movies/genres?language=en-US', controller.signal)
      .then(result => { if (!controller.signal.aborted) setGenres(result.items); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [validRoute]);

  useEffect(() => {
    if (!validRoute) { setLoading(false); return; }
    const controller = new AbortController();
    const restoreEarlierPages = restoring.current && page > 1;
    restoring.current = false;
    const requestedPages = restoreEarlierPages
      ? Array.from({ length: page }, (_, index) => index + 1)
      : [page];
    if (restoreEarlierPages || page === 1) setLoading(true); else setMore(true);
    setError(null);

    const loadPage = (pageNumber: number) => {
      const query = new URLSearchParams({ kind: config?.kind ?? 'popular', page: String(pageNumber) });
      if (genreId) query.set('genres', genreId);
      return apiGet<MoviePageData>('/movies/discover?' + query.toString(), controller.signal);
    };

    Promise.all(requestedPages.map(loadPage))
      .then(results => {
        if (controller.signal.aborted) return;
        const latest = results[results.length - 1];
        setTotalPages(Math.min(latest?.totalPages ?? 1, 500));
        setItems(previous => {
          const base = restoreEarlierPages || page === 1 ? [] : previous;
          const seen = new Set(base.map(item => item.externalId));
          const additions = results.flatMap(result => result.items).filter(item => {
            if (seen.has(item.externalId)) return false;
            seen.add(item.externalId);
            return true;
          });
          return [...base, ...additions];
        });
      })
      .catch(caught => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        if (restoreEarlierPages) restoring.current = true;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load these movies.'));
      })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setMore(false); } });
    return () => controller.abort();
  }, [config?.kind, genreId, page, retry, validRoute]);

  const genreName = useMemo(() => genres.find(genre => genre.externalId === genreId)?.name, [genres, genreId]);
  const title = genreId ? (genreName ? genreName + ' Movies' : 'Movies') : config?.title ?? 'Movies';
  const sentinel = useSentinel(() => setPage(page + 1), !loading && !more && !error && page < totalPages && items.length > 0, items.length);

  if (!validRoute) return <NotFoundPage />;

  return (
    <div className="nf nf-bleed nf-page">
      <header className="nf-page-head">
        <h1>{title}</h1>
        <GenreMenu genres={genres} activeId={genreId} />
      </header>

      {error && (
        <div className="nf-message" role="alert">
          <h2>{error.code === 'MOVIES_DISABLED' ? 'Movies are not available yet' : 'Something went wrong'}</h2>
          <p>{error.message}</p>
          <button type="button" className="nf-btn play" onClick={() => setRetry(value => value + 1)}>Try again</button>
        </div>
      )}
      {loading && <GridSkeleton />}
      {!loading && items.length > 0 && <MovieGrid items={items} />}
      {!loading && !error && items.length === 0 && (
        <div className="nf-message"><h2>No titles found here.</h2><p>Try another genre or search for a title.</p><Link to="/movies/search" className="nf-btn play">Search</Link></div>
      )}
      {more && <GridSkeleton count={6} />}
      <div ref={sentinel} className="nf-sentinel" />
    </div>
  );
}

export default function MoviesBrowsePage() {
  const { category = 'popular' } = useParams();
  return (
    <MyListProvider>
      <BrowseContent key={category} category={category} />
      <TitleModal />
    </MyListProvider>
  );
}
