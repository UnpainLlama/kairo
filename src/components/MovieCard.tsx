import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { movieHref, movieRating, movieYear, type MovieSummary } from '../lib/movies';

export default function MovieCard({ movie }: { movie: MovieSummary }) {
  const rating = movieRating(movie.voteAverage);
  const year = movieYear(movie);

  return (
    <article className="mv-card">
      <Link to={movieHref(movie)} className="mv-card-link" aria-label={'View ' + movie.title}>
        <span className="mv-poster">
          {movie.posterUrl
            ? <img src={movie.posterUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
            : <span className="mv-poster-fallback">{movie.title.slice(0, 1).toUpperCase()}</span>}
          {rating && <span className="mv-card-rating"><Star size={11} fill="currentColor" aria-hidden="true" />{rating}</span>}
          <span className="mv-card-open">View film</span>
        </span>
        <span className="mv-card-copy">
          <b>{movie.title}</b>
          <small>{[year, movie.originalLanguage?.toUpperCase()].filter(Boolean).join(' · ') || 'Feature film'}</small>
        </span>
      </Link>
    </article>
  );
}

export function MovieRail({ title, subtitle, items, to }: {
  title: string;
  subtitle?: string;
  items: MovieSummary[];
  to?: string;
}) {
  if (!items.length) return null;
  return (
    <section className="mv-section">
      <div className="mv-section-heading">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {to && <Link to={to}>Explore all <span aria-hidden="true">→</span></Link>}
      </div>
      <div className="mv-rail">
        {items.map(movie => <MovieCard key={movie.providerId + ':' + movie.externalId} movie={movie} />)}
      </div>
    </section>
  );
}
