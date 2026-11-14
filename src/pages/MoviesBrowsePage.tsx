import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Compass, Flame, RefreshCw, Sparkles, Star } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import { movieHref, movieRating, movieYear, type MovieGenre, type MoviePage as MoviePageData } from '../lib/movies';
import MovieCard from '../components/MovieCard';

const CATEGORIES: Record<string, { title: string; kind: string; description: string }> = {
  trending: { title: 'Trending movies', kind: 'trending_week', description: 'The films building momentum with audiences this week.' },
  popular: { title: 'Discover movies', kind: 'popular', description: 'Find a new favourite from films watched around the world.' },
  'top-rated': { title: 'Top rated movies', kind: 'top_rated', description: 'Highly rated films worth adding to your watchlist.' },
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
    ? { title: 'Explore by genre', kind: 'popular', description: 'Movies selected by genre.' }
    : { title: 'Movie discovery', kind: 'popular', description: 'Explore movies from across the world.' });
  const selectedGenre = useMemo(() => genres.find(genre => genre.externalId === validGenreId), [genres, validGenreId]);
  const isTrending = category === 'trending';
  const isDiscover = category === 'popular' || validGenreId !== null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ kind: details.kind, page: String(page) });
    if (validGenreId) query.set('genres', validGenreId);
    apiGet<MoviePageData>('/movies/discover?' + query.toString(), controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(caught => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load these movies.'));
        setData(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    if (isDiscover || validGenreId) {
      apiGet<{ items: MovieGenre[] }>('/movies/genres?language=en-US', controller.signal)
        .then(result => { if (!controller.signal.aborted) setGenres(result.items.slice(0, 18)); })
        .catch(() => { if (!controller.signal.aborted) setGenres([]); });
    } else {
      setGenres([]);
    }
    return () => controller.abort();
  }, [details.kind, page, validGenreId, isDiscover, retry]);

  const title = selectedGenre?.name ? selectedGenre.name + ' movies' : details.title;
  const totalPages = Math.max(1, Math.min(data?.totalPages ?? 1, 500));
  const featured = isTrending ? data?.items[0] ?? null : null;
  const featuredRating = featured ? movieRating(featured.voteAverage) : null;
  const featuredYear = featured ? movieYear(featured) : null;

  return (
    <section className={'mv-page mv-browse-page' + (isTrending ? ' mv-trending-page' : '') + (isDiscover ? ' mv-discover-page' : '')}>
      <Link to="/movies" className="mv-back-link"><ArrowLeft size={14} /> Movies home</Link>
      <header className={'mv-page-heading' + (isTrending ? ' mv-trending-heading' : '') + (isDiscover ? ' mv-discover-heading' : '')}>
        <span className="mv-eyebrow">{isTrending ? <><Flame size={12} /> TRENDING</> : isDiscover ? <><Compass size={12} /> DISCOVER MOVIES</> : <>MOVIES</>}</span>
        <h1>{title}</h1>
        <p>{selectedGenre?.name ? 'Discover ' + selectedGenre.name.toLowerCase() + ' films from around the world.' : details.description}</p>
      </header>

      {isDiscover && (
        <>
          <section className="mv-discover-pitch">
            <div className="mv-discover-pitch-mark"><Sparkles size={19} aria-hidden="true" /></div>
            <div><span>START SOMEWHERE NEW</span><h2>One good film leads to another.</h2><p>Browse by genre, follow a mood, or let a new story find you.</p></div>
          </section>
          {genres.length > 0 && (
            <nav className="mv-discover-genres" aria-label="Browse movie genres">
              <Link to="/movies/browse/popular" className={!validGenreId ? 'active' : ''}>For everyone</Link>
              {genres.map(genre => <Link key={genre.externalId} className={genre.externalId === validGenreId ? 'active' : ''} to={'/movies/browse/genre-' + genre.externalId}>{genre.name}</Link>)}
            </nav>
          )}
        </>
      )}

      {error && <div className="mv-provider-notice" role="alert"><div><b>{error.code === 'MOVIES_DISABLED' ? 'Movie browsing is not available yet' : 'Could not load these movies'}</b><p>{error.message}</p></div><button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} /> Retry</button></div>}

      {loading && (
        <div className="mv-browse-grid" role="status" aria-label="Loading movies">
          {Array.from({ length: isTrending ? 12 : 18 }, (_, index) => <div className="mv-skeleton" key={index}><span /><i /></div>)}
        </div>
      )}

      {!loading && data && (
        <>
          {isTrending && featured && (
            <section className="mv-trending-feature" aria-label="Number one trending movie">
              <div className="mv-trending-feature-copy">
                <span className="mv-trending-feature-kicker">#01 · THIS WEEK'S MOMENTUM</span>
                <h2>{featured.title}</h2>
                <div className="mv-trending-feature-facts">
                  {featuredYear && <span>{featuredYear}</span>}
                  {featuredRating && <span><Star size={12} fill="currentColor" aria-hidden="true" /> {featuredRating}</span>}
                  {featured.originalLanguage && <span>{featured.originalLanguage.toUpperCase()}</span>}
                </div>
                <p>{featured.overview || 'The title currently leading this week’s movie chart.'}</p>
                <Link to={movieHref(featured)} className="mv-trending-feature-link">Explore film <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
              <Link to={movieHref(featured)} className="mv-trending-feature-art" aria-label={'Explore ' + featured.title}>
                {featured.backdropUrl || featured.posterUrl
                  ? <img src={featured.backdropUrl || featured.posterUrl || ''} alt="" loading="lazy" />
                  : <span>{featured.title.slice(0, 1)}</span>}
              </Link>
            </section>
          )}

          <div className="mv-results-meta">
            <span>{data.totalResults.toLocaleString()} titles</span>
            <span>{isTrending ? 'Ranked by weekly popularity' : 'Page ' + data.page + ' of ' + Math.max(1, data.totalPages)}</span>
          </div>

          {data.items.length > 0
            ? isTrending
              ? <div className="mv-browse-grid mv-trending-grid">{data.items.slice(1).map((movie, index) => (
                  <div className="mv-ranked-card" key={movie.providerId + ':' + movie.externalId}>
                    <span className="mv-ranked-number" aria-hidden="true">{String(index + 2).padStart(2, '0')}</span>
                    <MovieCard movie={movie} />
                  </div>
                ))}</div>
              : <div className="mv-browse-grid mv-discover-grid">{data.items.map(movie => <MovieCard key={movie.providerId + ':' + movie.externalId} movie={movie} />)}</div>
            : <div className="mv-empty-state"><h2>No movies found here yet.</h2><p>Try another category or search for a specific title.</p><Link to="/movies/search">Search movies <ChevronRight size={14} /></Link></div>}

          <nav className="mv-pager" aria-label="Movie pages">
            <button type="button" disabled={page <= 1} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('page', String(page - 1)); return next; })}><ChevronLeft size={16} /> Previous</button>
            <span>{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages || !data.items.length} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('page', String(page + 1)); return next; })}>Next <ChevronRight size={16} /></button>
          </nav>
        </>
      )}
    </section>
  );
}
