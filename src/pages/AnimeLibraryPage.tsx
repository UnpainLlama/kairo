import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, RefreshCw, Trash2 } from 'lucide-react';
import { EmptyState, LoadingState } from '../components/catalog';
import { useKairoAccount } from '../lib/AccountProvider';
import { safeImageUrl } from '../lib/catalog';

type LibraryEntry = {
  animeId: string;
  slug: string;
  title: string;
  posterUrl: string | null;
  bannerUrl?: string | null;
  format?: string | null;
  releaseYear?: number | null;
  rating?: number | null;
  episodeCount?: number | null;
  status: 'watching' | 'plan_to_watch' | 'completed' | 'on_hold' | 'dropped';
  isFavorite: number | boolean;
};
const STATUS_OPTIONS = [
  { value: 'watching', label: 'Watching' },
  { value: 'plan_to_watch', label: 'Plan to watch' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'dropped', label: 'Dropped' },
] as const;

export default function AnimeLibraryPage() {
  const account = useKairoAccount();
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/v1/me/library', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not load your Anime library.');
      setItems(Array.isArray(payload.data?.items) ? payload.data.items : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your Anime library.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (account.status === 'signed-in') void load();
    else if (account.status === 'guest') { setItems([]); setLoading(false); }
    else if (account.status === 'unavailable') { setLoading(false); setError('Kairo could not verify your account. Retry before editing account data.'); }
  }, [account.status, account.accountId, load]);

  useEffect(() => {
    const refresh = () => { if (account.status === 'signed-in') void load(); };
    window.addEventListener('kairo:library-change', refresh);
    return () => window.removeEventListener('kairo:library-change', refresh);
  }, [account.status, load]);

  async function update(entry: LibraryEntry, changes: { status?: LibraryEntry['status']; isFavorite?: boolean }) {
    setBusyId(entry.animeId);
    setError('');
    const status = changes.status ?? entry.status;
    const isFavorite = changes.isFavorite ?? (entry.isFavorite === true || Number(entry.isFavorite) === 1);
    try {
      const response = await fetch('/api/v1/me/library/' + encodeURIComponent(entry.animeId), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, status, isFavorite }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not update this title.');
      setItems(current => current.map(item => item.animeId === entry.animeId ? { ...item, status, isFavorite } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this title.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(entry: LibraryEntry) {
    setBusyId(entry.animeId);
    setError('');
    try {
      const response = await fetch('/api/v1/me/library/' + encodeURIComponent(entry.animeId), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not remove this title.');
      setItems(current => current.filter(item => item.animeId !== entry.animeId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove this title.');
    } finally {
      setBusyId(null);
    }
  }

  if (account.status === 'loading') return <LoadingState label="Loading your account" />;
  if (account.status === 'guest') return <section className="kc-anime-library-page"><header className="kc-page-head"><span className="kc-section-kicker">YOUR COLLECTION</span><h1>My Anime Library</h1></header><EmptyState title="Sign in to build your library"><Link className="kc-link" to="/login">Sign in</Link> to save titles, organise watch status and sync your Anime library across devices.</EmptyState></section>;
  if (account.status === 'unavailable') return <section className="kc-anime-library-page"><header className="kc-page-head"><h1>My Anime Library</h1></header><EmptyState title="Account status unavailable">Your library is locked until Kairo can verify your session. Refresh the page or retry your account connection.</EmptyState></section>;

  return (
    <section className="kc-anime-library-page">
      <header className="kc-page-head"><span className="kc-section-kicker">YOUR COLLECTION</span><h1>My Anime Library</h1><p>Organise what you are watching and keep your favourites in sync.</p></header>
      {error && <div className="kc-notice kc-notice-error" role="alert"><p>{error}</p><button type="button" className="kc-btn" onClick={() => void load()}><RefreshCw size={15}/> Try again</button></div>}
      {loading ? <LoadingState label="Loading your library" /> : items.length === 0 ? <EmptyState title="Your Anime library is empty"><Link className="kc-link" to="/browse/anime">Discover Anime</Link> and add titles to your list.</EmptyState> : (
        <div className="kc-anime-library-grid">
          {items.map(entry => {
            const poster = safeImageUrl(entry.posterUrl);
            const favorite = entry.isFavorite === true || Number(entry.isFavorite) === 1;
            return <article className="kc-anime-library-card" key={entry.animeId}>
              <Link to={'/anime/' + encodeURIComponent(entry.slug)} className="kc-anime-library-poster">
                {poster ? <img src={poster} alt={'Poster for ' + entry.title} loading="lazy" /> : <span>{entry.title.slice(0, 1)}</span>}
              </Link>
              <div className="kc-anime-library-copy">
                <Link to={'/anime/' + encodeURIComponent(entry.slug)}><h2>{entry.title}</h2></Link>
                <p>{[entry.format, entry.releaseYear].filter(Boolean).join(' · ') || 'Anime'}</p>
                <label><span>Status</span><select value={entry.status} disabled={busyId === entry.animeId} onChange={event => void update(entry, { status: event.target.value as LibraryEntry['status'] })}>{STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <div className="kc-anime-library-controls">
                  <button type="button" className={favorite ? 'kc-btn active' : 'kc-btn'} aria-pressed={favorite} disabled={busyId === entry.animeId} onClick={() => void update(entry, { isFavorite: !favorite })}><Heart size={14} fill={favorite ? 'currentColor' : 'none'}/>Favourite</button>
                  <button type="button" className="kc-btn" disabled={busyId === entry.animeId} onClick={() => void remove(entry)}><Trash2 size={14}/>Remove</button>
                </div>
              </div>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
