import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Play, Plus } from 'lucide-react';
import { apiGet, ApiError } from '../lib/api';
import { useAccountScope } from '../hooks/useAccountScope';
import { loadMovieProgress } from '../lib/movieProgress';
import type { MovieGenre, MoviePage, MovieSummary } from '../lib/movies';
import { MovieRail, RowSkeleton, useOpenTitle, watchHref } from '../components/MovieCard';
import { TitleModal } from '../components/TitleDetail';
import { MyListProvider, useMyList } from '../lib/useMyList';
import '../styles-netflix.css';

type HomeData = {
  trending: MovieSummary[];
  popular: MovieSummary[];
  topRated: MovieSummary[];
  upcoming: MovieSummary[];
  nowPlaying: MovieSummary[];
  genres: MovieGenre[];
};

const EMPTY: HomeData = { trending: [], popular: [], topRated: [], upcoming: [], nowPlaying: [], genres: [] };
const GENRE_ROWS = 8;

async function loadHome(signal: AbortSignal): Promise<HomeData> {
  const [trending, popular, topRated, upcoming, nowPlaying, genres] = await Promise.all([
    apiGet<MoviePage>('/movies/discover?kind=trending_week&page=1', signal),
    apiGet<MoviePage>('/movies/discover?kind=popular&page=1', signal),
    apiGet<MoviePage>('/movies/discover?kind=top_rated&page=1', signal),
    apiGet<MoviePage>('/movies/discover?kind=upcoming&page=1', signal),
    apiGet<MoviePage>('/movies/discover?kind=now_playing&page=1', signal),
    apiGet<{ items: MovieGenre[] }>('/movies/genres?language=en-US', signal),
  ]);
  return { trending: trending.items, popular: popular.items, topRated: topRated.items, upcoming: upcoming.items, nowPlaying: nowPlaying.items, genres: genres.items };
}

/** A genre row that only loads once it scrolls near the viewport, like Netflix's lazy rows. */
function GenreRow({ genre }: { genre: MovieGenre }) {
  const holder = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MovieSummary[] | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = holder.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '500px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    apiGet<MoviePage>('/movies/discover?kind=popular&page=1&genres=' + genre.externalId, controller.signal)
      .then(page => { if (!controller.signal.aborted) setItems(page.items); })
      .catch(() => { if (!controller.signal.aborted) setItems([]); });
    return () => controller.abort();
  }, [visible, genre.externalId]);

  return (
    <div ref={holder}>
      {items === null ? <RowSkeleton title={genre.name + ' Movies'} /> : <MovieRail title={genre.name + ' Movies'} items={items} to={'/movies/browse/genre-' + genre.externalId} />}
    </div>
  );
}

function Billboard({ movie }: { movie: MovieSummary }) {
  const open = useOpenTitle();
  const list = useMyList();
  const inList = list.get(movie).status === 'watchlist';
  return (
    <header className="nf-billboard">
      {movie.backdropUrl && <img className="nf-bb-art" src={movie.backdropUrl} alt="" fetchPriority="high" referrerPolicy="no-referrer" />}
      <div className="nf-bb-fade" />
      <div className="nf-bb-info">
        <p className="nf-bb-tag"><i aria-hidden="true" />MOVIE</p>
        <h1 className="nf-bb-title"><button type="button" onClick={() => open(movie)} aria-label={'More info: ' + movie.title}>{movie.title}</button></h1>
        <div className="nf-bb-buttons">
          <Link to={watchHref(movie)} className="nf-btn play"><Play size={18} fill="currentColor" aria-hidden="true" /> Play</Link>
          <button type="button" className="nf-btn list" aria-pressed={inList} aria-busy={!list.ready || list.busy} disabled={!list.ready || list.busy} onClick={() => void list.update(movie, { status: inList ? null : 'watchlist' })}>
            {inList ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />} My List
          </button>
        </div>
        {list.error && <p className="nf-detail-note" role="alert">{list.error} <button type="button" onClick={list.retry}>Retry</button></p>}
        {movie.overview && <p className="nf-bb-text">{movie.overview}</p>}
      </div>
    </header>
  );
}

const FOOTER_LINKS: { label: string; to: string }[] = [
  { label: 'Trending Now', to: '/movies/browse/trending' },
  { label: 'Popular Movies', to: '/movies/browse/popular' },
  { label: 'Top Rated', to: '/movies/browse/top-rated' },
  { label: 'New Releases', to: '/movies/browse/now-playing' },
  { label: 'Coming Soon', to: '/movies/browse/upcoming' },
  { label: 'Search', to: '/movies/search' },
  { label: 'My List', to: '/movies/library' },
  { label: 'Settings', to: '/settings' },
  { label: 'About', to: '/about' },
];

function MoviesFooter() {
  return (
    <footer className="nf-footer">
      <div className="nf-footer-in">
        <nav className="nf-footer-links" aria-label="Movies">
          {FOOTER_LINKS.map(link => <Link key={link.to} to={link.to}>{link.label}</Link>)}
        </nav>
        <p className="nf-footer-note">Movie data and images are provided by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </div>
    </footer>
  );
}

function HomeContent() {
  const [data, setData] = useState<HomeData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [refresh, setRefresh] = useState(0);
  const { accountId, resolved: accountResolved, error: accountError, retry: retryAccount } = useAccountScope();
  const [continueWatching, setContinueWatching] = useState<MovieSummary[]>([]);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState('');
  const [progressRetry, setProgressRetry] = useState(0);

  const load = useCallback((signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    loadHome(signal)
      .then(result => { if (!signal.aborted) setData(result); })
      .catch(caught => {
        if (signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load movies.'));
        setData(EMPTY);
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);

  useEffect(() => {
    if (!accountResolved) return;
    const controller = new AbortController();
    setProgressLoading(true);
    setProgressError('');
    if (accountError) {
      setContinueWatching([]);
      setProgressError('Account status could not be verified, so synced playback progress is unavailable.');
      setProgressLoading(false);
      return () => controller.abort();
    }
    loadMovieProgress(accountId, controller.signal, 24)
      .then(entries => {
        if (controller.signal.aborted) return;
        setContinueWatching(entries
          .filter(entry => !entry.watchProgress.completed && entry.watchProgress.currentTime >= 5)
          .map(entry => ({ ...entry, watchProgress: entry.watchProgress })));
      })
      .catch(caught => {
        if (!controller.signal.aborted) setProgressError(caught instanceof Error ? caught.message : 'Could not load Continue Watching.');
      })
      .finally(() => { if (!controller.signal.aborted) setProgressLoading(false); });
    return () => controller.abort();
  }, [accountId, accountResolved, accountError, progressRetry]);

  const featured = data.trending.find(movie => movie.backdropUrl) ?? data.popular.find(movie => movie.backdropUrl) ?? null;
  const disabled = error?.code === 'MOVIES_DISABLED';

  return (
    <div className="nf nf-bleed nf-home">
      {featured ? <Billboard movie={featured} /> : loading ? <div className="nf-billboard nf-skel" role="status" aria-label="Loading" /> : <div className="nf-top-space" />}

      {error && (
        <div className="nf-message" role="alert">
          <h2>{disabled ? 'Movies are not available yet' : 'Something went wrong'}</h2>
          <p>{disabled ? 'Please check back soon.' : error.message}</p>
          {!disabled && <button type="button" className="nf-btn play" onClick={() => setRefresh(value => value + 1)}>Try again</button>}
        </div>
      )}

      <div className="nf-rows">
        {progressLoading && <RowSkeleton title="Continue Watching" />}
        {!progressLoading && continueWatching.length > 0 && <MovieRail title="Continue Watching" items={continueWatching} to="/movies/library" />}
        {progressError && <p className="nf-detail-note" role="status">{progressError} <button type="button" onClick={() => accountError ? retryAccount() : setProgressRetry(value => value + 1)}>Retry</button></p>}
        {loading && ['Top 10 Movies This Week', 'Popular Movies', 'Top Rated'].map(label => <RowSkeleton key={label} title={label} />)}
        {!loading && (
          <>
            <MovieRail title="Top 10 Movies This Week" items={data.trending.slice(0, 10)} to="/movies/browse/trending" topTen />
            <MovieRail title="Popular Movies" items={data.popular} to="/movies/browse/popular" />
            <MovieRail title="Trending Now" items={data.trending.slice(10)} to="/movies/browse/trending" />
            <MovieRail title="Top Rated" items={data.topRated} to="/movies/browse/top-rated" />
            <MovieRail title="New Releases" items={data.nowPlaying} to="/movies/browse/now-playing" />
            <MovieRail title="Coming Soon" items={data.upcoming} to="/movies/browse/upcoming" />
            {data.genres.slice(0, GENRE_ROWS).map(genre => <GenreRow key={genre.externalId} genre={genre} />)}
          </>
        )}
        {!loading && !error && !featured && (
          <div className="nf-message">
            <h2>No movies available right now.</h2>
            <p>Search for a title or try again later.</p>
            <Link to="/movies/search" className="nf-btn play">Search</Link>
          </div>
        )}
      </div>
      {!loading && <MoviesFooter />}
    </div>
  );
}

export default function MoviesHomePage() {
  return (
    <MyListProvider>
      <HomeContent />
      <TitleModal />
    </MyListProvider>
  );
}
