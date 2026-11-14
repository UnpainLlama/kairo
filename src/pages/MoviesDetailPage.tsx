import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Check, ExternalLink, Globe2, Heart, Play, Star } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import { movieDate, movieRating, movieYear, type MovieDetail } from '../lib/movies';
import { useAccountScope } from '../hooks/useAccountScope';
import { readMovieLibrary, updateMovieLibraryEntry, type MovieLibraryEntry, type MovieLibraryPatch } from '../lib/movieLibraryStorage';

type RemoteMovieEntry = {
  providerId: string;
  externalId: string;
  status: 'watchlist' | 'watched' | null;
  isFavorite: boolean;
  rating: number | null;
  addedAt: number;
  updatedAt: number;
};

export default function MoviesDetailPage() {
  const { externalId = '' } = useParams();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const { accountId, resolved: accountResolved, error: accountError, retry: retryAccount } = useAccountScope();
  const [libraryEntry, setLibraryEntry] = useState<MovieLibraryEntry | null>(null);
  const [libraryResolved, setLibraryResolved] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    let active = true;
    setLibraryResolved(false);
    setLibraryError('');
    setLibraryEntry(null);
    if (!accountResolved || !movie || accountError) return () => { active = false; };
    if (!accountId) {
      const local = readMovieLibrary(null).find(entry => entry.providerId === movie.providerId && entry.externalId === movie.externalId) ?? null;
      setLibraryEntry(local);
      setLibraryResolved(true);
      return () => { active = false; };
    }
    fetch('/api/v1/me/movies/library', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.items)) {
          throw new Error(payload?.error?.message ?? 'Could not load your Movies library.');
        }
        const remote = (payload.data.items as RemoteMovieEntry[]).find(entry =>
          entry.providerId === movie.providerId && entry.externalId === movie.externalId
        );
        if (!active) return;
        if (remote) {
          const cached = readMovieLibrary(accountId).find(entry => entry.providerId === movie.providerId && entry.externalId === movie.externalId);
          setLibraryEntry({
            ...movie,
            status: remote.status,
            isFavorite: (remote.isFavorite === true || Number(remote.isFavorite) === 1),
            addedAt: Number(remote.addedAt) || cached?.addedAt || Date.now(),
            updatedAt: Number(remote.updatedAt) || Date.now(),
          });
        } else {
          setLibraryEntry(null);
        }
        setLibraryResolved(true);
      })
      .catch(caught => {
        if (active) {
          setLibraryError(caught instanceof Error ? caught.message : 'Could not load your Movies library.');
          setLibraryResolved(true);
        }
      });
    return () => { active = false; };
  }, [accountId, accountResolved, accountError, movie]);

  const saveLibraryChange = async (patch: MovieLibraryPatch) => {
    if (!accountResolved || accountError || !movie || saving || !libraryResolved) return;
    const status = patch.status === undefined ? libraryEntry?.status ?? null : patch.status;
    const isFavorite = patch.isFavorite === undefined ? libraryEntry?.isFavorite ?? false : patch.isFavorite;
    setSaving(true);
    setLibraryError('');
    try {
      if (accountId) {
        const response = await fetch('/api/v1/me/movies/library', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: movie.providerId, externalId: movie.externalId, status, isFavorite, rating: null }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not sync this movie to your Kairo account.');
      }
      const next = updateMovieLibraryEntry(accountId, movie, { status, isFavorite });
      setLibraryEntry(next);
    } catch (caught) {
      setLibraryError(caught instanceof Error ? caught.message : 'Could not save this movie.');
    } finally {
      setSaving(false);
    }
  };

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
            <Link to={`/movies/${encodeURIComponent(movie.externalId)}/watch`} className="mv-action mv-action-light mv-detail-play">
              <Play size={16} fill="currentColor" /> Play film
            </Link>
            {movie.overview && <p className="mv-detail-overview">{movie.overview}</p>}
            <div className="mv-detail-genres">{movie.genres.map(genre=><Link key={genre.externalId} to={'/movies/browse/genre-' + genre.externalId}>{genre.name}</Link>)}</div>
            <div className="mv-detail-actions" aria-label="Save movie">
              <button type="button" className={libraryEntry?.status === 'watchlist' ? 'mv-library-button active' : 'mv-library-button'} aria-pressed={libraryEntry?.status === 'watchlist'} disabled={!libraryResolved || !!accountError || saving} onClick={() => void saveLibraryChange({ status: libraryEntry?.status === 'watchlist' ? null : 'watchlist' })}>
                <Bookmark size={15} /> {libraryEntry?.status === 'watchlist' ? 'In watchlist' : 'Watchlist'}
              </button>
              <button type="button" className={libraryEntry?.status === 'watched' ? 'mv-library-button active' : 'mv-library-button'} aria-pressed={libraryEntry?.status === 'watched'} disabled={!libraryResolved || !!accountError || saving} onClick={() => void saveLibraryChange({ status: libraryEntry?.status === 'watched' ? null : 'watched' })}>
                <Check size={15} /> {libraryEntry?.status === 'watched' ? 'Watched' : 'Mark watched'}
              </button>
              <button type="button" className={libraryEntry?.isFavorite ? 'mv-library-button active' : 'mv-library-button'} aria-pressed={libraryEntry?.isFavorite ?? false} disabled={!libraryResolved || !!accountError || saving} onClick={() => void saveLibraryChange({ isFavorite: !libraryEntry?.isFavorite })}>
                <Heart size={15} fill={libraryEntry?.isFavorite ? 'currentColor' : 'none'} /> {libraryEntry?.isFavorite ? 'Favorited' : 'Add favorite'}
              </button>
            </div>
            {accountError
              ? <p className="mv-library-note" role="alert">Could not verify your account, so the list is locked to prevent mixing guest and account data. <button type="button" className="mv-library-retry" onClick={retryAccount}>Retry</button></p>
              : !accountResolved
                ? <p className="mv-library-note" role="status">Checking your Kairo account before opening your list…</p>
                : libraryError
                  ? <p className="mv-library-note" role="alert">{libraryError}</p>
                  : accountId
                    ? <p className="mv-library-note">Saved with your Kairo account and synced across Anime, Movies and YouTube. <Link to="/movies/library">View My list</Link></p>
                    : <p className="mv-library-note">Saved in this browser only. It stays here when you return on this device. <Link to="/movies/library">View My list</Link></p>}
            {saving && <p className="mv-library-note" role="status">Saving…</p>}
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
