import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronRight, Clock3, Film, Globe2, Star } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import MovieEmbedPlayer from '../components/MovieEmbedPlayer';
import { movieDate, movieRating, movieYear, type MovieDetail } from '../lib/movies';

export default function MoviesWatchPage() {
  const { externalId = '' } = useParams();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setMovie(null);
    apiGet<MovieDetail>('/movies/' + encodeURIComponent(externalId), controller.signal)
      .then(result => { if (!controller.signal.aborted) setMovie(result); })
      .catch(caught => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load this film.'));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [externalId]);

  const detailsHref = '/movies/' + encodeURIComponent(externalId);

  if (loading) {
    return <section className="mv-watch-page"><div className="mv-watch-loading" role="status"><span /> Loading your film…</div></section>;
  }

  if (error || !movie) {
    return (
      <section className="mv-watch-page">
        <header className="mv-watch-topbar">
          <Link to="/movies" className="mv-watch-brand"><Film size={18} /> KAIRO <span>FILMS</span></Link>
        </header>
        <div className="mv-watch-error" role="alert">
          <b>{error?.code === 'MOVIES_DISABLED' ? 'Movies are not available yet' : 'This film could not be loaded'}</b>
          <p>{error?.message ?? 'The title may have been removed or is temporarily unavailable.'}</p>
          <Link to="/movies" className="mv-watch-outline"><ArrowLeft size={15} /> Back to movies</Link>
        </div>
      </section>
    );
  }

  const year = movieYear(movie);
  const rating = movieRating(movie.voteAverage);
  const runtime = movie.runtimeMinutes
    ? `${Math.floor(movie.runtimeMinutes / 60)}h ${movie.runtimeMinutes % 60}m`
    : null;
  const directors = movie.crew.filter(person => person.job === 'Director' || person.department === 'Directing').slice(0, 2);

  return (
    <article className="mv-watch-page">
      <header className="mv-watch-topbar">
        <Link to={detailsHref} className="mv-watch-back"><ArrowLeft size={16} /> <span>Back to film</span></Link>
        <Link to="/movies" className="mv-watch-brand"><Film size={18} /> KAIRO <span>FILMS</span></Link>
        <span className="mv-watch-topbar-status"><i /> NOW PLAYING</span>
      </header>

      <div className="mv-watch-content">
        <div className="mv-watch-heading">
          <div>
            <p className="mv-watch-kicker">YOUR MOVIE THEATRE</p>
            <h1>{movie.title}</h1>
            <div className="mv-watch-facts">
              {year && <span>{year}</span>}
              {runtime && <span><Clock3 size={13} /> {runtime}</span>}
              {movie.releaseDate && <span><CalendarDays size={13} /> {movieDate(movie.releaseDate)}</span>}
              {rating && <span><Star size={13} /> {rating}</span>}
              <span className="mv-watch-quality">MOVIE</span>
            </div>
          </div>
          <Link to={detailsHref} className="mv-watch-more">Film details <ChevronRight size={15} /></Link>
        </div>

        <section className="mv-watch-player-section" aria-label={`Watch ${movie.title}`}>
          <div className="mv-watch-player-heading">
            <span>NOW STREAMING</span>
            <span>SELECT A SOURCE BELOW</span>
          </div>
          <MovieEmbedPlayer
            tmdbId={movie.externalId}
            title={movie.title}
            posterUrl={movie.posterUrl}
            backdropUrl={movie.backdropUrl}
          />
        </section>

        <div className="mv-watch-info-grid">
          <section className="mv-watch-story">
            <p className="mv-watch-section-label">THE STORY</p>
            <h2>About this film</h2>
            <p className="mv-watch-overview">{movie.overview || 'No synopsis is available for this title yet.'}</p>
            {movie.genres.length > 0 && (
              <div className="mv-watch-genres" aria-label="Genres">
                {movie.genres.map(genre => (
                  <Link key={genre.externalId} to={'/movies/browse/genre-' + genre.externalId}>{genre.name}</Link>
                ))}
              </div>
            )}
            {movie.productionCountries.length > 0 && (
              <p className="mv-watch-countries"><Globe2 size={14} /> {movie.productionCountries.map(country => country.name).join(' · ')}</p>
            )}
          </section>

          <aside className="mv-watch-side">
            <div className="mv-watch-side-head">
              {movie.posterUrl && <img src={movie.posterUrl} alt={`Poster for ${movie.title}`} loading="lazy" />}
              <div>
                <p className="mv-watch-section-label">FILM INFORMATION</p>
                <b>{movie.title}</b>
                <span>{[year, runtime, movie.releaseStatus].filter(Boolean).join(' · ') || 'Feature film'}</span>
              </div>
            </div>
            {movie.cast.length > 0 && (
              <div className="mv-watch-credit-block">
                <p className="mv-watch-section-label">STARRING</p>
                <p>{movie.cast.slice(0, 6).map(person => person.name).join(' · ')}</p>
              </div>
            )}
            {directors.length > 0 && (
              <div className="mv-watch-credit-block">
                <p className="mv-watch-section-label">DIRECTED BY</p>
                <p>{directors.map(person => person.name).join(' · ')}</p>
              </div>
            )}
            {movie.spokenLanguages.length > 0 && (
              <div className="mv-watch-credit-block">
                <p className="mv-watch-section-label">AUDIO LANGUAGES</p>
                <p>{movie.spokenLanguages.slice(0, 4).map(language => language.englishName ?? language.name).join(' · ')}</p>
              </div>
            )}
          </aside>
        </div>

        <div className="mv-watch-footer">
          <Link to="/movies/browse/popular">Explore more movies <ChevronRight size={15} /></Link>
          <Link to={detailsHref}>Return to {movie.title} details</Link>
        </div>
      </div>
    </article>
  );
}
