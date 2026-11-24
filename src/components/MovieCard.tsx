import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Play, Plus, ThumbsUp, X } from 'lucide-react';
import { movieHref, movieYear, type MovieSummary } from '../lib/movies';
import { useMyList } from '../lib/useMyList';
import '../styles-netflix.css';

/** Opens the title details modal by writing ?mid=<id> to the current page. */
export function useOpenTitle() {
  const location = useLocation();
  const navigate = useNavigate();
  return useCallback((movie: Pick<MovieSummary, 'externalId'>, replace = false) => {
    const next = new URLSearchParams(location.search);
    next.set('mid', movie.externalId);
    const currentState = location.state && typeof location.state === 'object'
      ? location.state as Record<string, unknown>
      : {};
    const background = currentState.modalBackground &&
      typeof currentState.modalBackground === 'object'
      ? currentState.modalBackground as { pathname?: unknown; search?: unknown }
      : { pathname: location.pathname, search: location.search };
    navigate(
      { pathname: location.pathname, search: `?${next.toString()}` },
      { replace, state: { modalBackground: background } },
    );
  }, [location, navigate]);
}

export function watchHref(movie: Pick<MovieSummary, 'externalId'>): string {
  return movieHref(movie) + '/watch';
}

type CardProps = {
  movie: MovieSummary;
  variant?: 'landscape' | 'poster';
  edge?: 'first' | 'last' | null;
  onRemove?: () => void;
};

export default function MovieCard({ movie, variant = 'landscape', edge = null, onRemove }: CardProps) {
  const open = useOpenTitle();
  const list = useMyList();
  const saved = list.get(movie);
  const inList = saved.status === 'watchlist';
  const year = movieYear(movie);
  const percent = movie.voteAverage && movie.voteAverage > 0 ? Math.round(movie.voteAverage * 10) : null;
  const image = variant === 'poster' ? movie.posterUrl || movie.backdropUrl : movie.backdropUrl || movie.posterUrl;
  const locked = !list.ready || list.busy;

  const onOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(movie);
  };

  return (
    <article className={'nf-card ' + (variant === 'poster' ? 'nf-poster' : 'nf-landscape') + (edge ? ' is-' + edge : '')}>
      <div className="nf-card-box">
        <Link to={movieHref(movie)} className="nf-thumb" onClick={onOpen} aria-label={'More info: ' + movie.title}>
          {image
            ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            : <span className="nf-thumb-fallback">{movie.title}</span>}
          {variant === 'landscape' && image && <span className="nf-thumb-title">{movie.title}</span>}
        </Link>
        {onRemove && (
          <button type="button" className="nf-remove" onClick={onRemove} aria-label={'Remove ' + movie.title + ' from My List'}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
        <div className="nf-panel">
          <div className="nf-panel-actions">
            <Link to={watchHref(movie)} className="nf-round solid" aria-label={'Play ' + movie.title}><Play size={14} fill="currentColor" aria-hidden="true" /></Link>
            <button type="button" className="nf-round" aria-pressed={inList} disabled={locked} title={inList ? 'Remove from My List' : 'Add to My List'} aria-label={inList ? 'Remove from My List' : 'Add to My List'} onClick={() => void list.update(movie, { status: inList ? null : 'watchlist' })}>
              {inList ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            </button>
            <button type="button" className="nf-round" aria-pressed={saved.isFavorite} disabled={locked} title={saved.isFavorite ? 'Remove like' : 'I like this'} aria-label={saved.isFavorite ? 'Remove like' : 'I like this'} onClick={() => void list.update(movie, { isFavorite: !saved.isFavorite })}>
              <ThumbsUp size={14} fill={saved.isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button type="button" className="nf-round nf-more" onClick={() => open(movie)} title="More info" aria-label={'More info: ' + movie.title}><ChevronDown size={16} aria-hidden="true" /></button>
          </div>
          <p className="nf-panel-title">{movie.title}</p>
          <p className="nf-panel-meta">
            {percent && <b>{percent}% rated</b>}
            {movie.adult && <span className="nf-box">18+</span>}
            {year && <span>{year}</span>}
            {movie.originalLanguage && <span className="nf-box">{movie.originalLanguage.toUpperCase()}</span>}
          </p>
        </div>
      </div>
    </article>
  );
}

function perPageFor(width: number): number {
  return width >= 1400 ? 6 : width >= 1100 ? 5 : width >= 800 ? 4 : width >= 500 ? 3 : 2;
}

function useItemsPerPage(): number {
  const [count, setCount] = useState(() => perPageFor(typeof window === 'undefined' ? 1400 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setCount(perPageFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return count;
}

/** Netflix-style row: paged slider with peeking neighbours, hover handles, page bars and "Explore All". */
export function MovieRail({ title, items, to, topTen = false }: { title: string; items: MovieSummary[]; to?: string; topTen?: boolean }) {
  const headingId = useId();
  const base = useItemsPerPage();
  const per = base;
  const [page, setPage] = useState(0);
  const [moved, setMoved] = useState(false);
  useEffect(() => setPage(0), [per, items.length]);
  if (!items.length) return null;

  const pages = Math.max(1, Math.ceil(items.length / per));
  const offset = Math.min(page * per, Math.max(0, items.length - per));
  const go = (direction: -1 | 1) => { setMoved(true); setPage(current => (current + direction + pages) % pages); };

  return (
    <section className="nf-row" aria-labelledby={headingId}>
      <div className="nf-row-head">
        <h2 id={headingId} className="nf-row-title">
          {to
            ? <Link to={to}><span>{title}</span><span className="nf-explore" aria-hidden="true">Explore All <ChevronRight size={14} /></span></Link>
            : title}
        </h2>
        {pages > 1 && <div className="nf-pager" aria-hidden="true">{Array.from({ length: pages }, (_, index) => <i key={index} className={index === page ? 'on' : ''} />)}</div>}
      </div>
      <div className="nf-slider" style={{ '--nf-ipp': per } as CSSProperties}>
        {pages > 1 && moved && <button type="button" className="nf-handle prev" onClick={() => go(-1)} aria-label={'Previous titles in ' + title}><ChevronLeft size={34} aria-hidden="true" /></button>}
        <div className="nf-track" style={{ '--nf-x': -offset * (100 / per) + '%' } as CSSProperties} role="list">
          {items.map((movie, index) => {
            const slot = index - offset;
            const edge = slot === 0 ? 'first' : slot === per - 1 ? 'last' : null;
            return (
              <div role="listitem" className={'nf-cell' + (topTen ? ' nf-ten' : '')} key={movie.providerId + ':' + movie.externalId}>
                {topTen && <span className="nf-rank" aria-hidden="true">{index + 1}</span>}
                <MovieCard movie={movie} variant={topTen ? 'poster' : 'landscape'} edge={edge} />
              </div>
            );
          })}
        </div>
        {pages > 1 && <button type="button" className="nf-handle next" onClick={() => go(1)} aria-label={'Next titles in ' + title}><ChevronRight size={34} aria-hidden="true" /></button>}
      </div>
    </section>
  );
}

/** Grid used by browse, search and My List pages. */
export function MovieGrid({ items, onRemove }: { items: MovieSummary[]; onRemove?: (movie: MovieSummary) => void }) {
  return (
    <div className="nf-grid" role="list">
      {items.map(movie => (
        <div role="listitem" className="nf-gcell" key={movie.providerId + ':' + movie.externalId}>
          <MovieCard movie={movie} onRemove={onRemove ? () => onRemove(movie) : undefined} />
        </div>
      ))}
    </div>
  );
}

export function RowSkeleton({ title }: { title?: string }) {
  return (
    <section className="nf-row" aria-hidden="true">
      <div className="nf-row-head"><h2 className="nf-row-title">{title ?? <span className="nf-skel nf-skel-title" />}</h2></div>
      <div className="nf-slider" style={{ '--nf-ipp': perPageFor(typeof window === 'undefined' ? 1400 : window.innerWidth) } as CSSProperties}>
        <div className="nf-track">{Array.from({ length: 8 }, (_, index) => <div className="nf-cell" key={index}><div className="nf-skel nf-skel-card" /></div>)}</div>
      </div>
    </section>
  );
}

export function GridSkeleton({ count = 18 }: { count?: number }) {
  return <div className="nf-grid" aria-hidden="true">{Array.from({ length: count }, (_, index) => <div className="nf-gcell" key={index}><div className="nf-skel nf-skel-card" /></div>)}</div>;
}

/** Fires onHit whenever the returned sentinel scrolls into view; re-arms when version changes. */
export function useSentinel(onHit: () => void, enabled: boolean, version: number) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onHit);
  latest.current = onHit;
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) latest.current(); }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, version]);
  return ref;
}
