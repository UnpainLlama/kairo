import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Check, ExternalLink, Globe2, Heart, Star } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import { movieDate, movieRating, movieYear, type MovieDetail } from '../lib/movies';
import { useAccountScope } from '../hooks/useAccountScope';
import { readMovieLibrary, updateMovieLibraryEntry, type MovieLibraryEntry } from '../lib/movieLibraryStorage';

export default function MoviesDetailPage() {
  const { externalId = '' } = useParams();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const { accountId, resolved: accountResolved, error: accountError, retry: retryAccount } = useAccountScope();
  const [libraryEntry, setLibraryEntry] = useState<MovieLibraryEntry | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiGet<MovieDetail>('/movies/' + encodeURIComponent(externalId), controller.signal)
      .then(result => { if (!controller.signal.aborted) setMovie(result); })
      .catch(caught => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load this film.'));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [externalId]);

  if (loading) return <section className="mv-page"><div className="mv-detail-skeleton" role="status">Loading movie details…</div></section>;
  if (error || !movie) return <section className="mv-page"><Link to="/movies" className="mv-back-link"><ArrowLeft size={14} /> Movies home</Link><div className="mv-provider-notice" role="alert"><div><b>{error?.code === 'MOVIES_DISABLED' ? 'Movie metadata is not enabled yet' : 'Film details unavailable'}</b><p>{error?.message ?? 'This film could not be found.'}</p></div></div></section>;

  useEffect(() => {
    if (!accountResolved || !movie) return;
    const refresh = () => {
      const entry = readMovieLibrary(accountId).find((item) =>
        item.providerId === movie.providerId && item.externalId === movie.externalId
      ) ?? null;
      setLibraryEntry(entry);
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('kairo:movie-library-change', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('kairo:movie-library-change', refresh);
    };
  }, [accountId, accountResolved, movie]);

  const saveLibraryChange = (patch: { status?: 'watchlist' | 'watched' | null; isFavorite?: boolean }) => {
    if (!accountResolved || !movie) return;
    setLibraryEntry(updateMovieLibraryEntry(accountId, movie, patch));
  };

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
            <div className="mv-detail-actions" aria-label="Save movie">
              <button type="button" className={libraryEntry?.status === 'watchlist' ? 'mv-library-button active' : 'mv-library-button'} aria-pressed={libraryEntry?.status === 'watchlist'} disabled={!accountResolved} onClick={() => saveLibraryChange({ status: libraryEntry?.status === 'watchlist' ? null : 'watchlist' })}>
                <Bookmark size={15} /> {libraryEntry?.status === 'watchlist' ? 'In watchlist' : 'Watchlist'}
              </button>
              <button type="button" className={libraryEntry?.status === 'watched' ? 'mv-library-button active' : 'mv-library-button'} aria-pressed={libraryEntry?.status === 'watched'} disabled={!accountResolved} onClick={() => saveLibraryChange({ status: libraryEntry?.status === 'watched' ? null : 'watched' })}>
                <Check size={15} /> {libraryEntry?.status === 'watched' ? 'Watched' : 'Mark watched'}
              </button>
              <button type="button" className={libraryEntry?.isFavorite ? 'mv-library-button active' : 'mv-library-button'} aria-pressed={libraryEntry?.isFavorite ?? false} disabled={!accountResolved} onClick={() => saveLibraryChange({ isFavorite: !libraryEntry?.isFavorite })}>
                <Heart size={15} fill={libraryEntry?.isFavorite ? 'currentColor' : 'none'} /> {libraryEntry?.isFavorite ? 'Favorited' : 'Add favorite'}
              </button>
            </div>
            {accountResolved
              ? <p className="mv-library-note">Saved in this browser only. Your movie list does not sync across devices yet. <Link to="/movies/library">View My list</Link></p>
              : accountError
                ? <p className="mv-library-note" role="alert">Could not verify your account, so the local list is locked to prevent mixing accounts. <button type="button" className="mv-library-retry" onClick={retryAccount}>Retry</button></p>
                : <p className="mv-library-note" role="status">Checking your account before opening your local list…</p>}
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
