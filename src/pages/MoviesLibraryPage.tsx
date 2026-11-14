import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bookmark, Heart, Trash2 } from 'lucide-react';
import MovieCard from '../components/MovieCard';
import { readMovieLibrary, removeMovieFromLibrary, type MovieLibraryEntry } from '../lib/movieLibraryStorage';
import { useAccountScope } from '../hooks/useAccountScope';

type Filter = 'all' | 'watchlist' | 'watched' | 'favorites';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All saved' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'watched', label: 'Watched' },
  { id: 'favorites', label: 'Favorites' },
];

export default function MoviesLibraryPage() {
  const { accountId, resolved, error, retry } = useAccountScope();
  const [entries, setEntries] = useState<MovieLibraryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!resolved) return;
    const refresh = () => setEntries(readMovieLibrary(accountId));
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('kairo:movie-library-change', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('kairo:movie-library-change', refresh);
    };
  }, [accountId, resolved]);

  const visible = useMemo(() => entries.filter((entry) => {
    if (filter === 'watchlist') return entry.status === 'watchlist';
    if (filter === 'watched') return entry.status === 'watched';
    if (filter === 'favorites') return entry.isFavorite;
    return true;
  }), [entries, filter]);

  const remove = (entry: MovieLibraryEntry) => {
    removeMovieFromLibrary(accountId, entry.providerId, entry.externalId);
    setEntries(readMovieLibrary(accountId));
  };

  return (
    <section className="mv-page mv-library-page">
      <Link to="/movies" className="mv-back-link"><ArrowLeft size={14} /> Movies home</Link>
      <header className="mv-library-heading">
        <div>
          <span className="mv-eyebrow">YOUR MOVIES</span>
          <h1>My list</h1>
          <p>Keep track of films you want to watch, have watched, or love.</p>
        </div>
        <span className="mv-library-count">{entries.length} {entries.length === 1 ? 'film' : 'films'}</span>
      </header>

      <p className="mv-library-note">
        {accountId
          ? 'This list is saved in this browser for your account. It does not sync across devices yet.'
          : 'Your list is saved on this device. Sign-in is not required, but it does not sync across devices.'}
      </p>

      {error && <div className="mv-provider-notice" role="alert"><div><b>Could not check your account</b><p>Your list has not been opened to avoid mixing guest and account data.</p></div><button type="button" onClick={retry}>Retry</button></div>}
      {!resolved && !error && <div className="mv-detail-skeleton" role="status">Checking your local list…</div>}

      {resolved && (
        <>
          <div className="mv-library-filters" role="group" aria-label="Filter saved movies">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
                <span>{item.id === 'all' ? entries.length : item.id === 'watchlist' ? entries.filter((entry) => entry.status === 'watchlist').length : item.id === 'watched' ? entries.filter((entry) => entry.status === 'watched').length : entries.filter((entry) => entry.isFavorite).length}</span>
              </button>
            ))}
          </div>

          {visible.length > 0 ? (
            <div className="mv-library-grid">
              {visible.map((entry) => (
                <div className="mv-library-item" key={entry.providerId + ':' + entry.externalId}>
                  <MovieCard movie={entry} />
                  <div className="mv-library-item-meta">
                    {entry.status === 'watchlist' && <span><Bookmark size={12} /> Watchlist</span>}
                    {entry.status === 'watched' && <span>Watched</span>}
                    {entry.isFavorite && <span><Heart size={12} fill="currentColor" /> Favorite</span>}
                    <button type="button" onClick={() => remove(entry)} aria-label={'Remove ' + entry.title + ' from My list'}><Trash2 size={14} /> Remove</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mv-empty-state">
              <h2>{entries.length === 0 ? 'Your list is empty.' : 'Nothing in this list yet.'}</h2>
              <p>{entries.length === 0 ? 'Open a movie and add it to your Watchlist, mark it watched, or save it as a favorite.' : 'Choose another filter or save a movie from its detail page.'}</p>
              <Link to="/movies/browse/popular">Discover movies</Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
