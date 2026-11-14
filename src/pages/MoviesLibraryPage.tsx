import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bookmark, Heart, Trash2 } from 'lucide-react';
import MovieCard from '../components/MovieCard';
import { readMovieLibrary, removeMovieFromLibrary, type MovieLibraryEntry } from '../lib/movieLibraryStorage';
import { useAccountScope } from '../hooks/useAccountScope';
import { apiGet } from '../lib/api';
import type { MovieDetail, MovieSummary } from '../lib/movies';

type Filter = 'all' | 'watchlist' | 'watched' | 'favorites';
type RemoteEntry = {
  providerId: string;
  externalId: string;
  status: 'watchlist' | 'watched' | null;
  isFavorite: boolean;
  addedAt: number;
  updatedAt: number;
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All saved' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'watched', label: 'Watched' },
  { id: 'favorites', label: 'Favorites' },
];

async function loadRemoteMovies(items: RemoteEntry[], signal: AbortSignal): Promise<{ entries: MovieLibraryEntry[]; missing: number }> {
  const refs = items.filter(item => item.providerId === 'tmdb' && /^\d{1,12}$/.test(item.externalId)).slice(0, 100);
  const results: MovieLibraryEntry[] = [];
  for (let offset = 0; offset < refs.length; offset += 8) {
    const batch = refs.slice(offset, offset + 8);
    const loaded = await Promise.all(batch.map(async ref => {
      try {
        const movie = await apiGet<MovieDetail>('/movies/' + encodeURIComponent(ref.externalId), signal);
        const summary: MovieSummary = {
          providerId: movie.providerId,
          externalId: movie.externalId,
          title: movie.title,
          originalTitle: movie.originalTitle,
          overview: movie.overview,
          releaseDate: movie.releaseDate,
          releaseYear: movie.releaseYear,
          originalLanguage: movie.originalLanguage,
          posterUrl: movie.posterUrl,
          backdropUrl: movie.backdropUrl,
          voteAverage: movie.voteAverage,
          voteCount: movie.voteCount,
          popularity: movie.popularity,
          adult: movie.adult,
        };
        return {
          ...summary,
          status: ref.status,
          isFavorite: ref.isFavorite === true || Number(ref.isFavorite) === 1,
          addedAt: Number(ref.addedAt) || Date.now(),
          updatedAt: Number(ref.updatedAt) || Date.now(),
        } satisfies MovieLibraryEntry;
      } catch {
        return null;
      }
    }));
    results.push(...loaded.filter((entry): entry is MovieLibraryEntry => entry !== null));
    if (signal.aborted) break;
  }
  return { entries: results, missing: refs.length - results.length };
}

export default function MoviesLibraryPage() {
  const { accountId, resolved, error, retry } = useAccountScope();
  const [entries, setEntries] = useState<MovieLibraryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!resolved || error) return;
    const controller = new AbortController();
    setEntries([]);
    setLoading(true);
    setLoadError('');
    if (!accountId) {
      setEntries(readMovieLibrary(null));
      setLoading(false);
      return () => controller.abort();
    }
    fetch('/api/v1/me/movies/library', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.items)) {
          throw new Error(payload?.error?.message ?? 'Could not load your Kairo Movies library.');
        }
        return loadRemoteMovies(payload.data.items as RemoteEntry[], controller.signal);
      })
      .then(result => {
        if (controller.signal.aborted) return;
        setEntries(result.entries);
        if (result.missing > 0) setLoadError(`${result.missing} saved movie detail(s) could not be loaded. Your account list is still saved; retry when the Movies provider is available.`);
      })
      .catch(caught => {
        if (!controller.signal.aborted) setLoadError(caught instanceof Error ? caught.message : 'Could not load your Movies library.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accountId, resolved, error]);

  const visible = useMemo(() => entries.filter((entry) => {
    if (filter === 'watchlist') return entry.status === 'watchlist';
    if (filter === 'watched') return entry.status === 'watched';
    if (filter === 'favorites') return entry.isFavorite;
    return true;
  }), [entries, filter]);

  const remove = async (entry: MovieLibraryEntry) => {
    if (!accountId) {
      removeMovieFromLibrary(null, entry.providerId, entry.externalId);
      setEntries(readMovieLibrary(null));
      return;
    }
    setLoadError('');
    try {
      const response = await fetch('/api/v1/me/movies/library', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: entry.providerId, externalId: entry.externalId, status: null, isFavorite: false, rating: null }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not remove this movie.');
      setEntries(current => current.filter(item => item.providerId !== entry.providerId || item.externalId !== entry.externalId));
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Could not remove this movie.');
    }
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
          ? 'Your list is saved with your Kairo account and syncs across devices.'
          : 'Your list is saved in this browser. It remains here when you return on this device.'}
      </p>

      {error && <div className="mv-provider-notice" role="alert"><div><b>Could not check your account</b><p>Your list is locked until account status is known, so guest and account data cannot mix.</p></div><button type="button" onClick={retry}>Retry</button></div>}
      {!resolved && !error && <div className="mv-detail-skeleton" role="status">Checking your local list…</div>}
      {loading && <div className="mv-detail-skeleton" role="status">Loading your saved movies…</div>}
      {loadError && <div className="mv-provider-notice" role="alert"><div>{loadError}</div></div>}

      {resolved && !error && !loading && (
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
                    <button type="button" onClick={() => void remove(entry)} aria-label={'Remove ' + entry.title + ' from My list'}><Trash2 size={14} /> Remove</button>
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
