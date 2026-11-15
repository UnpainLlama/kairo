import { useEffect, useState } from 'react';
import { Bookmark, Heart, Trash2 } from 'lucide-react';
import type { AnimeDetails } from '../lib/catalog';
import { useKairoAccount } from '../lib/AccountProvider';

const STATUSES = [
  { value: 'watching', label: 'Watching' },
  { value: 'plan_to_watch', label: 'Plan to watch' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'dropped', label: 'Dropped' },
] as const;

type LibraryStatus = typeof STATUSES[number]['value'];

export default function AnimeLibraryActions({ anime }: { anime: AnimeDetails }) {
  const account = useKairoAccount();
  const [status, setStatus] = useState<LibraryStatus>('plan_to_watch');
  const [isFavorite, setIsFavorite] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setSaved(false);
    setStatus('plan_to_watch');
    setIsFavorite(false);
    setError('');
    if (account.status !== 'signed-in') {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    fetch('/api/v1/me/library', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not load your Anime library.');
        return payload.data?.items ?? [];
      })
      .then((items: Array<{ animeId?: string; status?: string; isFavorite?: number | boolean }>) => {
        if (!active) return;
        const entry = items.find(item => item.animeId === anime.id);
        if (entry) {
          setSaved(true);
          if (STATUSES.some(value => value.value === entry.status)) setStatus(entry.status as LibraryStatus);
          setIsFavorite(entry.isFavorite === true || Number(entry.isFavorite) === 1);
        }
      })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load your Anime library.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account.accountId, account.status, anime.id]);

  async function save(nextStatus = status, nextFavorite = isFavorite) {
    if (account.status !== 'signed-in') return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/v1/me/library/' + encodeURIComponent(anime.id), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          isFavorite: nextFavorite,
          slug: anime.slug,
          title: anime.title,
          posterUrl: anime.posterUrl,
          bannerUrl: anime.bannerUrl,
          format: anime.format,
          releaseYear: anime.releaseYear,
          rating: anime.rating,
          episodeCount: anime.episodeCount,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not save this title.');
      setStatus(nextStatus);
      setIsFavorite(nextFavorite);
      setSaved(true);
      window.dispatchEvent(new Event('kairo:library-change'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this title.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (account.status !== 'signed-in') return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/v1/me/library/' + encodeURIComponent(anime.id), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not remove this title.');
      setSaved(false);
      setIsFavorite(false);
      setStatus('plan_to_watch');
      window.dispatchEvent(new Event('kairo:library-change'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove this title.');
    } finally {
      setSaving(false);
    }
  }

  if (account.status !== 'signed-in') {
    return <div className="kc-library-action-note"><Bookmark size={15} /> <span><a href="/login" className="kc-link">Sign in</a> to save Anime to your account and sync it across devices.</span></div>;
  }

  return (
    <div className="kc-anime-library-actions">
      <label className="kc-library-status">
        <span className="kc-sr">Anime library status</span>
        <select value={status} onChange={event => { const next = event.target.value as LibraryStatus; setStatus(next); if (saved) void save(next, isFavorite); }} disabled={loading || saving}>
          {STATUSES.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
        </select>
      </label>
      <button type="button" className={saved ? 'kc-btn kc-library-save saved' : 'kc-btn kc-library-save'} onClick={() => void save(status, isFavorite)} disabled={loading || saving}>
        <Bookmark size={15} />{saving ? 'Saving…' : saved ? 'Update list' : 'Add to my list'}
      </button>
      <button type="button" className={isFavorite ? 'kc-btn kc-library-favorite active' : 'kc-btn kc-library-favorite'} onClick={() => void save(status, !isFavorite)} disabled={loading || saving} aria-pressed={isFavorite} aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}>
        <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      {saved && <button type="button" className="kc-btn kc-library-remove" onClick={() => void remove()} disabled={saving}><Trash2 size={15} /> Remove</button>}
      {error && <p className="kc-auth-error" role="alert">{error}</p>}
    </div>
  );
}
