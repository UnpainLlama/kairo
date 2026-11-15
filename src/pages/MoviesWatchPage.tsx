import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock3, Globe2, Star } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import MovieEmbedPlayer from '../components/MovieEmbedPlayer';
import { movieDate, movieRating, movieYear, type MovieDetail } from '../lib/movies';
import '../styles-netflix.css';

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
  const year = movie ? movieYear(movie) : null;
  const rating = movie ? movieRating(movie.voteAverage) : null;
  const runtime = movie?.runtimeMinutes
    ? Math.floor(movie.runtimeMinutes / 60) + 'h ' + String(movie.runtimeMinutes % 60).padStart(2, '0') + 'm'
    : null;
  const directors = useMemo(
    () => movie?.crew.filter(person => person.job === 'Director' || person.department === 'Directing').slice(0, 2) ?? [],
    [movie],
  );

  if (loading) {
    return <div className="nf nf-bleed nf-watch-loading" role="status"><span className="nf-spinner" aria-label="Loading movie" /></div>;
  }

  if (error || !movie) {
    return (
      <section className="nf nf-bleed nf-watch-error" role="alert">
        <Link to="/movies" className="nf-back"><ArrowLeft size={18} /> Back to movies</Link>
        <div className="nf-message">
          <h2>{error?.code === 'MOVIES_DISABLED' ? 'Movies are not available yet' : 'This film could not be loaded'}</h2>
          <p>{error?.message ?? 'The title may have been removed or is temporarily unavailable.'}</p>
          <Link to="/movies" className="nf-btn play">Browse movies</Link>
        </div>
      </section>
    );
  }

  return (
    <article className="nf nf-bleed nf-watch-page">
      <header className="nf-watch-topbar">
        <Link to={detailsHref} className="nf-watch-back"><ArrowLeft size={17} /> <span>Back to film</span></Link>
        <Link to="/movies" className="nf-watch-brand">KAIRO <span>FILMS</span></Link>
        <span className="nf-watch-status"><i /> NOW PLAYING</span>
      </header>

      <section className="nf-watch-hero">
        {movie.backdropUrl && <img src={movie.backdropUrl} alt="" className="nf-watch-backdrop" referrerPolicy="no-referrer" />}
        <span className="nf-watch-shade" />
        <div className="nf-watch-hero-copy">
          <p className="nf-watch-kicker">KAIRO FILMS · FEATURE PRESENTATION</p>
          <h1>{movie.title}</h1>
          <div className="nf-watch-facts">
            {year && <span>{year}</span>}
            {runtime && <span><Clock3 size={13} /> {runtime}</span>}
            {movie.releaseDate && <span><CalendarDays size={13} /> {movieDate(movie.releaseDate)}</span>}
            {rating && <span><Star size={13} fill="currentColor" /> {rating}</span>}
            <span className="nf-watch-badge">MOVIE</span>
          </div>
        </div>
      </section>

      <div className="nf-watch-content">
        <section className="nf-watch-player-section" aria-label={`Watch ${movie.title}`}>
          <div className="nf-watch-player-heading">
            <span>NOW PLAYING</span>
            <span>VIDLINK · JW PLAYER</span>
          </div>
          {movie.providerId === 'tmdb' ? (
            <MovieEmbedPlayer
              tmdbId={movie.externalId}
              title={movie.title}
              posterUrl={movie.posterUrl}
              backdropUrl={movie.backdropUrl}
            />
          ) : (
            <div className="nf-watch-player-error" role="alert">
              <p>VidLink requires a TMDB movie ID. This title is not identified as a TMDB movie.</p>
            </div>
          )}
        </section>

        <div className="nf-watch-info-grid">
          <section className="nf-watch-story">
            <p className="nf-watch-section-label">THE STORY</p>
            <h2>About this film</h2>
            <p>{movie.overview || 'No synopsis is available for this title yet.'}</p>
            {movie.genres.length > 0 && (
              <div className="nf-watch-genres" aria-label="Genres">
                {movie.genres.map(genre => <Link key={genre.externalId} to={'/movies/browse/genre-' + genre.externalId}>{genre.name}</Link>)}
              </div>
            )}
            {movie.productionCountries.length > 0 && (
              <p className="nf-watch-countries"><Globe2 size={14} /> {movie.productionCountries.map(country => country.name).join(' · ')}</p>
            )}
          </section>

          <aside className="nf-watch-side">
            <div className="nf-watch-film-info">
              {movie.posterUrl && <img src={movie.posterUrl} alt={`Poster for ${movie.title}`} loading="lazy" />}
              <div><p className="nf-watch-section-label">FILM INFORMATION</p><b>{movie.title}</b><span>{[year, runtime, movie.releaseStatus].filter(Boolean).join(' · ') || 'Feature film'}</span></div>
            </div>
            {movie.cast.length > 0 && <div className="nf-watch-credit"><p className="nf-watch-section-label">STARRING</p><p>{movie.cast.slice(0, 6).map(person => person.name).join(' · ')}</p></div>}
            {directors.length > 0 && <div className="nf-watch-credit"><p className="nf-watch-section-label">DIRECTED BY</p><p>{directors.map(person => person.name).join(' · ')}</p></div>}
            {movie.spokenLanguages.length > 0 && <div className="nf-watch-credit"><p className="nf-watch-section-label">AUDIO LANGUAGES</p><p>{movie.spokenLanguages.slice(0, 4).map(language => language.englishName ?? language.name).join(' · ')}</p></div>}
          </aside>
        </div>

        <footer className="nf-watch-footer">
          <Link to="/movies/browse/popular">Explore more movies</Link>
          <Link to={detailsHref}>Return to {movie.title} details</Link>
        </footer>
      </div>
    </article>
  );
}
