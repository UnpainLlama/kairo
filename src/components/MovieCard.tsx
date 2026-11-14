import { useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { movieHref, movieRating, movieYear, type MovieSummary } from '../lib/movies';

type MovieCardProps = {
  movie: MovieSummary;
};

export default function MovieCard({ movie }: MovieCardProps) {
  const year = movieYear(movie);
  const rating = movieRating(movie.voteAverage);
  const image = movie.posterUrl || movie.backdropUrl;

  return (
    <article className="mv-card">
      <Link to={movieHref(movie)} className="mv-card-link" aria-label={'View ' + movie.title}>
        <span className="mv-poster">
          {image
            ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            : <span className="mv-poster-fallback" aria-hidden="true">{movie.title.slice(0, 1).toUpperCase()}</span>}
          {rating && <span className="mv-card-rating"><Star size={11} fill="currentColor" aria-hidden="true" />{rating}</span>}
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
  const headingId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  if (!items.length) return null;

  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.72, 260), behavior: 'smooth' });
  };

  return (
    <section className="mv-section" aria-labelledby={headingId}>
      <div className="mv-section-heading">
        <div className="mv-section-heading-copy">
          <span className="mv-section-kicker">MOVIE COLLECTION</span>
          <h2 id={headingId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="mv-section-tools">
          {to && <Link className="mv-section-view-all" to={to}>View all <ArrowRight size={14} aria-hidden="true" /></Link>}
          <div className="mv-rail-controls" aria-label={title + ' controls'}>
            <button type="button" onClick={() => scroll(-1)} aria-label={'Scroll ' + title + ' left'}><ChevronLeft size={17} aria-hidden="true" /></button>
            <button type="button" onClick={() => scroll(1)} aria-label={'Scroll ' + title + ' right'}><ChevronRight size={17} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      <div className="mv-rail" ref={railRef} role="region" aria-label={title + ' movies'} tabIndex={0}>
        {items.map(movie => <MovieCard key={movie.providerId + ':' + movie.externalId} movie={movie} />)}
      </div>
    </section>
  );
}
