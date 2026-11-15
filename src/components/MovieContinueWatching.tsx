import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { useKairoAccount } from '../lib/AccountProvider';

type MovieProgress = {
  providerId: string;
  externalId: string;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  progressSeconds: number;
  durationSeconds: number | null;
  updatedAt: number;
};

export default function MovieContinueWatching() {
  const account = useKairoAccount();
  const [items, setItems] = useState<MovieProgress[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setItems([]);
    if (account.status !== 'signed-in') {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    fetch('/api/v1/me/movies/history', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }).then(async response => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error('Could not restore Movies progress.');
      return Array.isArray(payload.data?.items) ? payload.data.items as MovieProgress[] : [];
    }).then(rows => {
      if (!active) return;
      setItems(rows
        .filter(item => item && item.providerId === 'tmdb' && /^\d{1,12}$/.test(String(item.externalId)) &&
          Number(item.progressSeconds) > 0 &&
          (!Number(item.durationSeconds) || Number(item.progressSeconds) < Number(item.durationSeconds) * 0.95))
        .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
        .slice(0, 16));
    }).catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account.accountId, account.status]);

  if (account.status !== 'signed-in' || (!loading && items.length === 0)) return null;
  return (
    <section className="nf-continue-section" aria-labelledby="mv-continue-title">
      <div className="nf-continue-head">
        <div><h2 id="mv-continue-title">Continue watching</h2><p>Pick up where you left off</p></div>
        <span className="nf-continue-account">SYNCED TO YOUR ACCOUNT</span>
      </div>
      {loading ? <div className="nf-continue-loading" role="status">Restoring your watch list…</div> : (
        <div className="nf-continue-rail">
          {items.map(item => {
            const duration = Number(item.durationSeconds) || 0;
            const progress = duration > 0 ? Math.max(0, Math.min(100, Number(item.progressSeconds) / duration * 100)) : 0;
            return <Link to={`/movies/${encodeURIComponent(item.externalId)}/watch`} className="nf-continue-card" key={item.externalId}>
              <span className="nf-continue-poster">
                {item.posterUrl ? <img src={item.posterUrl} alt={`Poster for ${item.title}`} loading="lazy" /> : <span className="nf-continue-poster-fallback">K</span>}
                <span className="nf-continue-play"><Play size={18} fill="currentColor" /></span>
                <span className="nf-continue-progress"><i style={{ width: progress + '%' }} /></span>
              </span>
              <span className="nf-continue-copy"><b>{item.title}</b><small>{duration > 0 ? `${Math.floor(Number(item.progressSeconds) / 60)} min watched · ${Math.max(1, Math.ceil((duration - Number(item.progressSeconds)) / 60))} min left` : 'Resume film'}</small></span>
            </Link>;
          })}
        </div>
      )}
    </section>
  );
}
