import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Play, RefreshCw, Star } from 'lucide-react';
import { apiGet, ApiError } from '../lib/api';
import { movieHref, movieRating, movieYear, type MovieGenre, type MoviePage, type MovieSummary } from '../lib/movies';
import { MovieRail } from '../components/MovieCard';

type HomeData = {
  trending: MovieSummary[];
  popular: MovieSummary[];
  topRated: MovieSummary[];
  upcoming: MovieSummary[];
  nowPlaying: MovieSummary[];
  genres: MovieGenre[];
};

const EMPTY: HomeData = { trending: [], popular: [], topRated: [], upcoming: [], nowPlaying: [], genres: [] };

async function loadHome(signal: AbortSignal): Promise<HomeData> {
  const paths = [
    '/movies/discover?kind=trending_week&page=1',
    '/movies/discover?kind=popular&page=1',
    '/movies/discover?kind=top_rated&page=1',
    '/movies/discover?kind=upcoming&page=1',
    '/movies/discover?kind=now_playing&page=1',
    '/movies/genres?language=en-US',
  ];
  const [trending, popular, topRated, upcoming, nowPlaying, genres] = await Promise.all([
    apiGet<MoviePage>(paths[0], signal),
    apiGet<MoviePage>(paths[1], signal),
    apiGet<MoviePage>(paths[2], signal),
    apiGet<MoviePage>(paths[3], signal),
    apiGet<MoviePage>(paths[4], signal),
    apiGet<{ items: MovieGenre[] }>(paths[5], signal),
  ]);
  return {
    trending: trending.items,
    popular: popular.items,
    topRated: topRated.items,
    upcoming: upcoming.items,
    nowPlaying: nowPlaying.items,
    genres: genres.items,
  };
}

export default function MoviesHomePage() {
  const [data, setData] = useState<HomeData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback((signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    loadHome(signal)
      .then(result => { if (!signal.aborted) setData(result); })
      .catch(caught => {
        if (signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        const issue = caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load movies.');
        setError(issue);
        setData(EMPTY);
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);

  const featured = data.trending[0] ?? data.popular[0] ?? null;
  const rating = featured ? movieRating(featured.voteAverage) : null;
  const featuredYear = featured ? movieYear(featured) : null;
  const genres = useMemo(() => data.genres.slice(0, 14), [data.genres]);
  const disabled = error?.code === 'MOVIES_DISABLED';

  return (
    <section className="mv-home">
      {(featured || loading) && (
        <header className={'mv-hero' + (featured?.backdropUrl ? ' has-art' : '')}>
          {featured?.backdropUrl && <img className="mv-hero-art" src={featured.backdropUrl} alt="" fetchPriority="high" />}
          <div className="mv-hero-shade" />
          <div className="mv-hero-copy">
            {featured ? (
              <>
                <span className="mv-eyebrow">MOVIES</span>
                <span className="mv-featured-label">FEATURED THIS WEEK</span>
                <h1>{featured.title}</h1>
                <div className="mv-hero-meta">
                  {featuredYear && <span>{featuredYear}</span>}
                  {rating && <span><Star size={13} fill="currentColor" /> {rating} rating</span>}
                  {featured.originalLanguage && <span>{featured.originalLanguage.toUpperCase()}</span>}
                </div>
                {featured.overview && <p>{featured.overview}</p>}
                <div className="mv-hero-actions">
                  <Link to={movieHref(featured)} className="mv-action mv-action-light"><Play size={16} fill="currentColor" /> More details</Link>
                  <Link to="/movies/browse/trending" className="mv-action mv-action-glass">Explore trending <ArrowRight size={15} /></Link>
                </div>
              </>
            ) : (
              <div className="mv-hero-loading" role="status" aria-label="Loading featured movie">
                <span className="mv-hero-loading-label" />
                <span className="mv-hero-loading-title" />
                <span className="mv-hero-loading-line" />
                <span className="mv-hero-loading-line short" />
                <span className="mv-hero-loading-action" />
              </div>
            )}
          </div>
          {featured && <div className="mv-hero-current"><span>NOW SHOWING</span><b>{featured.title}</b></div>}
        </header>
      )}

      <div className="mv-home-content">
        <nav className="mv-category-strip" aria-label="Movie categories">
          <Link to="/movies" className="active">For you</Link>
          <Link to="/movies/browse/trending">Trending</Link>
          <Link to="/movies/browse/popular">Popular</Link>
          <Link to="/movies/browse/top-rated">Top rated</Link>
          <Link to="/movies/browse/upcoming">Coming soon</Link>
          <Link to="/movies/browse/now-playing">Now playing</Link>
        </nav>

        {error && (
          <div className="mv-provider-notice" role="status">
            <div className="mv-provider-mark">M</div>
            <div>
              <b>{disabled ? 'Movie listings are not available yet.' : 'Movie browsing is temporarily unavailable.'}</b>
              <p>{disabled ? 'Please check back soon.' : error.message}</p>
            </div>
            {!disabled && <button type="button" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /> Retry</button>}
          </div>
        )}

        {loading && <div className="mv-loading-rails" role="status" aria-label="Loading movies">
          {['Trending this week', 'Popular movies', 'Top rated'].map(label => <section className="mv-section" key={label}><div className="mv-section-heading"><h2>{label}</h2></div><div className="mv-rail">{Array.from({length:7},(_,index)=><div className="mv-skeleton" key={index}><span /><i /></div>)}</div></section>)}
        </div>}

        {!loading && (
          <>
            <MovieRail title="Trending this week" subtitle="The films drawing attention right now" items={data.trending} to="/movies/browse/trending" />
            <MovieRail title="Popular movies" subtitle="Big stories. Global favourites." items={data.popular} to="/movies/browse/popular" />
            <MovieRail title="Top rated" subtitle="Highly rated films worth your time" items={data.topRated} to="/movies/browse/top-rated" />
            <MovieRail title="Coming soon" subtitle="What's on the horizon" items={data.upcoming} to="/movies/browse/upcoming" />
            <MovieRail title="Now playing" subtitle="Recently released films" items={data.nowPlaying} to="/movies/browse/now-playing" />
          </>
        )}

        {genres.length > 0 && (
          <section className="mv-section mv-genres-section">
            <div className="mv-section-heading"><div><h2>Find your genre</h2><p>Choose a mood. Find your next film.</p></div></div>
            <div className="mv-genre-grid">
              {genres.map(genre => <Link key={genre.externalId} to={'/movies/browse/genre-' + genre.externalId}><span>{genre.name}</span><ChevronRight size={15} /></Link>)}
            </div>
          </section>
        )}
        {!loading && !error && !featured && <div className="mv-empty-state"><h2>No movies available right now.</h2><p>Search for a film or choose another category.</p><Link to="/movies/search">Search movies <ArrowRight size={14} /></Link></div>}
      </div>
    </section>
  );
}
