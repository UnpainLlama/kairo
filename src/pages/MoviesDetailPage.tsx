import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Globe2, Star } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import { movieDate, movieRating, movieYear, type MovieDetail } from '../lib/movies';

export default function MoviesDetailPage() {
  const { externalId = '' } = useParams();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiGet<MovieDetail>('/movies/' + encodeURIComponent(externalId), controller.signal)
      .then(setMovie)
      .catch(caught => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load this film.'));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [externalId]);

  if (loading) return <section className="mv-page"><div className="mv-detail-skeleton" role="status">Loading movie details…</div></section>;
  if (error || !movie) return <section className="mv-page"><Link to="/movies" className="mv-back-link"><ArrowLeft size={14} /> Movies home</Link><div className="mv-provider-notice" role="alert"><div><b>{error?.code === 'MOVIES_DISABLED' ? 'Movie metadata is not enabled yet' : 'Film details unavailable'}</b><p>{error?.message ?? 'This film could not be found.'}</p></div></div></section>;

  const rating = movieRating(movie.voteAverage);
  return (
    <article className="mv-detail-page">
      <div className="mv-detail-backdrop">{movie.backdropUrl && <img src={movie.backdropUrl} alt="" />}<span /></div>
      <div className="mv-detail-content">
        <Link to="/movies" className="mv-back-link"><ArrowLeft size={14} /> Movies home</Link>
        <div className="mv-detail-hero">
          <div className="mv-detail-poster">{movie.posterUrl ? <img src={movie.posterUrl} alt={'Poster for ' + movie.title} /> : <span>{movie.title.slice(0,1)}</span>}</div>
          <div className="mv-detail-copy">
            <span className="mv-eyebrow">MOVIE DETAILS</span>
            <h1>{movie.title}</h1>
            {movie.tagline && <p className="mv-detail-tagline">{movie.tagline}</p>}
            <div className="mv-detail-facts">
              {movieYear(movie) && <span>{movieYear(movie)}</span>}
              {movie.runtimeMinutes && <span>{Math.floor(movie.runtimeMinutes/60)}h {movie.runtimeMinutes%60}m</span>}
              {movie.releaseDate && <span>{movieDate(movie.releaseDate)}</span>}
              {rating && <span className="mv-detail-rating"><Star size={13} fill="currentColor" /> {rating}</span>}
            </div>
            {movie.overview && <p className="mv-detail-overview">{movie.overview}</p>}
            <div className="mv-detail-genres">{movie.genres.map(genre=><Link key={genre.externalId} to={'/movies/browse/genre-' + genre.externalId}>{genre.name}</Link>)}</div>
            {movie.homepageUrl && <a className="mv-action mv-action-glass" href={movie.homepageUrl} target="_blank" rel="noreferrer">Official site <ExternalLink size={14} /></a>}
          </div>
        </div>
        {movie.productionCountries.length > 0 && <p className="mv-detail-languages"><Globe2 size={15} /> {movie.productionCountries.map(country=>country.name).join(' · ')}</p>}
        {movie.cast.length > 0 && <section className="mv-detail-section"><h2>Cast</h2><div className="mv-people-grid">{movie.cast.slice(0,18).map((person,index)=><div className="mv-person" key={person.externalPersonId ?? person.name + index}>{person.profileUrl ? <img src={person.profileUrl} alt="" loading="lazy" /> : <span>{person.name.slice(0,1)}</span>}<b>{person.name}</b>{person.character && <small>{person.character}</small>}</div>)}</div></section>}
        {movie.crew.length > 0 && <section className="mv-detail-section"><h2>Featured crew</h2><div className="mv-crew-list">{movie.crew.filter(person=>person.job === 'Director' || person.department === 'Directing').slice(0,8).map((person,index)=><span key={person.externalPersonId ?? person.name + index}><b>{person.name}</b><small>{person.job ?? 'Crew'}</small></span>)}</div></section>}
      </div>
    </article>
  );
}
