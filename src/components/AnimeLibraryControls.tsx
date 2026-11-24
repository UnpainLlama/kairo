import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useKairoAccount } from '../lib/AccountProvider';

type LibraryStatus = 'watching' | 'plan_to_watch' | 'completed' | 'on_hold' | 'dropped';
const STATUS_OPTIONS: { value: LibraryStatus; label: string }[] = [
  { value: 'watching', label: 'Watching' },
  { value: 'plan_to_watch', label: 'Plan to watch' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'dropped', label: 'Dropped' },
];

export default function AnimeLibraryControls({ animeId }: { animeId: string }) {
  const account = useKairoAccount();
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (account.status !== 'signed-in') {
      setLoaded(true);
      return () => { active = false; };
    }
    setLoaded(false);
    fetch('/api/v1/me/library', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload?.data?.items)) {
          throw new Error(payload?.error?.message ?? 'Could not load your Anime library.');
        }
        const entry = payload.data.items.find((item: any) => String(item.animeId) === animeId);
        if (active) {
          setStatus(entry && STATUS_OPTIONS.some(option => option.value === entry.status) ? entry.status : null);
          setFavorite(entry?.isFavorite === true || Number(entry?.isFavorite) === 1);
        }
      })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load your Anime library.'); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [account.status, animeId]);

  async function save(nextStatus: LibraryStatus | null, nextFavorite: boolean) {
    if (account.status !== 'signed-in' || busy) return;
    setBusy(true);
    setError('');
    try {
      const removing = nextStatus === null && !nextFavorite;
      const response = await fetch('/api/v1/me/library/' + encodeURIComponent(animeId), {
        method: removing ? 'DELETE' : 'PUT',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(removing ? {} : { 'Content-Type': 'application/json' }) },
        ...(removing ? {} : { body: JSON.stringify({ status: nextStatus, isFavorite: nextFavorite }) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not save this Anime title.');
      setStatus(removing ? null : (payload.data?.status as LibraryStatus | null) ?? nextStatus);
      setFavorite(removing ? false : nextFavorite);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this Anime title.');
    } finally {
      setBusy(false);
    }
  }

  if (account.status === 'loading' || !loaded) return <span className="kc-auth-copy" role="status">Loading library…</span>;
  if (account.status !== 'signed-in') {
    return <Link className="kc-btn kc-btn-dark" to="/login?continue=%2Flibrary">Sign in to save</Link>;
  }

  return (
    <div className="kc-anime-library-controls">
      <label>
        <span className="sr-only">Add to Anime library</span>
        <select
          className="kc-btn kc-btn-dark"
          aria-label="Anime library status"
          value={status ?? ''}
          disabled={busy}
          onChange={event => void save(event.target.value ? event.target.value as LibraryStatus : null, favorite)}
        >
          <option value="">Not in library</option>
          {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="kc-btn kc-btn-dark"
        aria-pressed={favorite}
        disabled={busy}
        onClick={() => void save(status, !favorite)}
      >
        {favorite ? '♥ Favorited' : '♡ Favorite'}
      </button>
      {error && <p className="kc-auth-error" role="alert">{error}</p>}
    </div>
  );
}
