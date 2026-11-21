import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Eye, Play, Plus, ThumbsUp, X } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import { movieDetailErrorPresentation } from '../lib/movieDetailError';
import { movieRating, movieYear, type MovieDetail, type MoviePage, type MovieSummary } from '../lib/movies';
import { useMyList } from '../lib/useMyList';
import { useOpenTitle, watchHref } from './MovieCard';
import '../styles-netflix.css';

const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

function SimilarCard({ movie, onOpen }: { movie: MovieSummary; onOpen: () => void }) {
  const list = useMyList();
  const inList = list.get(movie).status === 'watchlist';
  const year = movieYear(movie);
  const image = movie.backdropUrl || movie.posterUrl;
  return (
    <div className="nf-more-card">
      <button type="button" className="nf-more-thumb" onClick={onOpen} aria-label={'More info: ' + movie.title}>
        {image ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{movie.title}</span>}
        <b>{movie.title}</b>
      </button>
      <div className="nf-more-body">
        <div className="nf-more-top">
          <span>{movie.voteAverage ? Math.round(movie.voteAverage * 10) + '% rated' : ''}{year ? (movie.voteAverage ? '  ' : '') + year : ''}</span>
          <button type="button" className="nf-round" aria-pressed={inList} disabled={!list.ready || list.busy} aria-label={inList ? 'Remove from My List' : 'Add to My List'} onClick={() => void list.update(movie, { status: inList ? null : 'watchlist' })}>
            {inList ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
          </button>
        </div>
        {movie.overview && <p>{movie.overview}</p>}
      </div>
    </div>
  );
}

/** Title details shared by the modal (?mid=) and the full /movies/:id page. */
export function TitleDetail({ externalId, onClose }: { externalId: string; onClose?: () => void }) {
  const openTitle = useOpenTitle();
  const list = useMyList();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [similar, setSimilar] = useState<MovieSummary[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setMovie(null); setSimilar([]);
    apiGet<MovieDetail>('/movies/' + encodeURIComponent(externalId), controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setMovie(result);
        const genre = result.genres[0]?.externalId;
        if (genre) {
          apiGet<MoviePage>('/movies/discover?kind=popular&page=1&genres=' + encodeURIComponent(genre), controller.signal)
            .then(page => { if (!controller.signal.aborted) setSimilar(page.items.filter(item => item.externalId !== result.externalId).slice(0, 12)); })
            .catch(() => undefined);
        }
      })
      .catch(caught => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load this title.'));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [externalId]);

  const saved = movie ? list.get(movie) : { status: null, isFavorite: false };
  const directors = useMemo(() => movie?.crew.filter(person => person.job === 'Director').slice(0, 4) ?? [], [movie]);
  const cast = movie?.cast.slice(0, 8) ?? [];

  const close = onClose && (
    <button type="button" className="nf-close" onClick={onClose} aria-label="Close"><X size={20} aria-hidden="true" /></button>
  );

  if (loading) return <div className="nf-detail"><div className="nf-detail-hero nf-skel" />{close}<div className="nf-detail-pad"><span className="nf-skel nf-skel-line" /><span className="nf-skel nf-skel-line short" /></div></div>;
  if (error || !movie) {
    const presentation = movieDetailErrorPresentation(error);
    return (
      <div className="nf-detail">
        {close}
        <div className="nf-detail-pad nf-detail-error" role="alert">
          <h2>{presentation.title}</h2>
          <p>{presentation.message}</p>
          <Link to="/movies" className="nf-btn play">Go to Home</Link>
        </div>
      </div>
    );
  }

  const percent = movie.voteAverage && movie.voteAverage > 0 ? Math.round(movie.voteAverage * 10) : null;
  const year = movieYear(movie);
  const locked = !list.ready || list.busy;
  const inList = saved.status === 'watchlist';
  const watched = saved.status === 'watched';
  const rating = movieRating(movie.voteAverage);

  return (
    <div className="nf-detail">
      <div className="nf-detail-hero">
        {movie.backdropUrl && <img src={movie.backdropUrl} alt="" referrerPolicy="no-referrer" />}
        <span className="nf-detail-fade" />
        {close}
        <div className="nf-detail-head">
          <h1>{movie.title}</h1>
          <div className="nf-detail-actions">
            <Link to={watchHref(movie)} className="nf-btn play"><Play size={20} fill="currentColor" aria-hidden="true" /> Play</Link>
            <button type="button" className="nf-round big" aria-pressed={inList} disabled={locked} title={inList ? 'Remove from My List' : 'Add to My List'} aria-label={inList ? 'Remove from My List' : 'Add to My List'} onClick={() => void list.update(movie, { status: inList ? null : 'watchlist' })}>{inList ? <Check size={20} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}</button>
            <button type="button" className="nf-round big" aria-pressed={saved.isFavorite} disabled={locked} title={saved.isFavorite ? 'Remove like' : 'I like this'} aria-label={saved.isFavorite ? 'Remove like' : 'I like this'} onClick={() => void list.update(movie, { isFavorite: !saved.isFavorite })}><ThumbsUp size={19} fill={saved.isFavorite ? 'currentColor' : 'none'} aria-hidden="true" /></button>
            <button type="button" className="nf-round big" aria-pressed={watched} disabled={locked} title={watched ? 'Marked as watched' : 'Mark as watched'} aria-label={watched ? 'Marked as watched' : 'Mark as watched'} onClick={() => void list.update(movie, { status: watched ? null : 'watched' })}><Eye size={19} aria-hidden="true" /></button>
          </div>
        </div>
      </div>

      {(list.locked || list.error) && <p className="nf-detail-note" role="alert">{list.locked ? 'We could not verify your account, so My List is locked. ' : list.error + ' '}{list.locked && <button type="button" onClick={list.retry}>Try again</button>}</p>}

      <div className="nf-detail-pad nf-detail-cols">
        <div className="nf-detail-main">
          <p className="nf-detail-meta">
            {percent && <b>{percent}% rated</b>}
            {year && <span>{year}</span>}
            {movie.runtimeMinutes ? <span>{hours(movie.runtimeMinutes)}</span> : null}
            {movie.adult && <span className="nf-box">18+</span>}
            {rating && <span className="nf-box">HD</span>}
          </p>
          {movie.tagline && <p className="nf-detail-tagline">{movie.tagline}</p>}
          <p className="nf-detail-overview">{movie.overview || 'No synopsis is available for this title yet.'}</p>
        </div>
        <dl className="nf-detail-side">
          {cast.length > 0 && <div><dt>Cast:</dt><dd>{cast.slice(0, 4).map(person => person.name).join(', ')}</dd></div>}
          {movie.genres.length > 0 && <div><dt>Genres:</dt><dd>{movie.genres.map((genre, index) => <span key={genre.externalId}>{index > 0 && ', '}<Link to={'/movies/browse/genre-' + genre.externalId}>{genre.name}</Link></span>)}</dd></div>}
          {directors.length > 0 && <div><dt>Director:</dt><dd>{directors.map(person => person.name).join(', ')}</dd></div>}
        </dl>
      </div>

      {similar.length > 0 && (
        <section className="nf-detail-pad" aria-labelledby="nf-similar">
          <h2 id="nf-similar" className="nf-detail-h2">More Like This</h2>
          <div className="nf-more-grid">
            {similar.map(item => <SimilarCard key={item.providerId + ':' + item.externalId} movie={item} onOpen={() => openTitle(item, true)} />)}
          </div>
        </section>
      )}

      <section className="nf-detail-pad nf-about" aria-labelledby="nf-about">
        <h2 id="nf-about" className="nf-detail-h2">About <b>{movie.title}</b></h2>
        <dl>
          {directors.length > 0 && <div><dt>Director:</dt><dd>{directors.map(person => person.name).join(', ')}</dd></div>}
          {cast.length > 0 && <div><dt>Cast:</dt><dd>{cast.map(person => person.name).join(', ')}</dd></div>}
          {movie.genres.length > 0 && <div><dt>Genres:</dt><dd>{movie.genres.map(genre => genre.name).join(', ')}</dd></div>}
          {movie.originalTitle && movie.originalTitle !== movie.title && <div><dt>Original title:</dt><dd>{movie.originalTitle}</dd></div>}
          {movie.spokenLanguages.length > 0 && <div><dt>Audio:</dt><dd>{movie.spokenLanguages.slice(0, 4).map(language => language.englishName ?? language.name).join(', ')}</dd></div>}
          {movie.productionCountries.length > 0 && <div><dt>Made in:</dt><dd>{movie.productionCountries.map(country => country.name).join(', ')}</dd></div>}
        </dl>
      </section>
    </div>
  );
}

/** Overlay that opens over any Movies page when the URL contains ?mid=<tmdb id>. */
export function TitleModal() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const externalId = params.get('mid');
  const valid = externalId && /^[1-9]\d{0,11}$/.test(externalId) ? externalId : null;
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = () => {
    const state = location.state && typeof location.state === 'object'
      ? location.state as { modalBackground?: { pathname?: unknown; search?: unknown } }
      : null;
    const background = state?.modalBackground;
    if (typeof background?.pathname === 'string' &&
        background.pathname.startsWith('/') && !background.pathname.startsWith('//')) {
      const search = typeof background.search === 'string' && background.search.startsWith('?')
        ? background.search
        : '';
      navigate({ pathname: background.pathname, search }, { replace: true, state: null });
      return;
    }
    // Direct links and refreshed deep links have no background state. Close the
    // modal on the current page instead of navigating to an unrelated history entry.
    params.delete('mid');
    navigate(
      { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' },
      { replace: true, state: null },
    );
  };

  useEffect(() => {
    if (!valid) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    wrapRef.current?.focus();
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  useEffect(() => { wrapRef.current?.scrollTo({ top: 0 }); }, [valid]);

  if (!valid) return null;
  return createPortal(
    <div className="nf nf-modal-wrap" ref={wrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Title details" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="nf-modal"><TitleDetail externalId={valid} onClose={close} /></div>
    </div>,
    document.body,
  );
}

