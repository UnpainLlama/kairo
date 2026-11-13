import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bookmark, History, Trash2, Youtube } from 'lucide-react';

type LibraryVideo = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  progressSeconds?: number;
  completed?: number;
  updatedAt?: number;
  savedAt?: number;
};

type LibraryKind = 'history' | 'watch-later';

function YouTubeLibrary({ kind }: { kind: LibraryKind }) {
  const [items, setItems] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const path = kind === 'history' ? '/api/v1/youtube/history' : '/api/v1/youtube/watch-later';
  const title = kind === 'history' ? 'Watch history' : 'Watch Later';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSignedOut(false);
    try {
      const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) {
        setSignedOut(true);
        setItems([]);
        return;
      }
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not load your videos.');
      setItems(payload.data?.items ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your videos.');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (videoId: string) => {
    setRemoving(videoId);
    setError('');
    try {
      const response = await fetch(path + '/' + encodeURIComponent(videoId), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not remove this video.');
      setItems(current => current.filter(item => item.videoId !== videoId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove this video.');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="yt-page yt-library-page">
      <header className="yt-page-heading">
        <div>
          <span className="yt-eyebrow">YOUR VIDEO LIBRARY</span>
          <h1>{title}</h1>
          <p>{kind === 'history' ? 'Pick up where you left off.' : 'Videos you have saved to watch later.'}</p>
        </div>
        <Link to="/youtube" className="yt-button yt-button-quiet">YouTube Home <ArrowUpRight size={14} /></Link>
      </header>
      {signedOut && <div className="yt-empty"><Bookmark size={28} /><h3>Sign in to use your library</h3><p>Your YouTube history and Watch Later list are stored with your Kairo account.</p><Link to="/login" className="yt-button yt-button-primary">Sign in</Link></div>}
      {error && <div className="yt-notice" role="alert">{error}</div>}
      {loading && <div className="yt-loading" role="status">Loading your videos…</div>}
      {!loading && !signedOut && !error && items.length === 0 && (
        <div className="yt-empty">
          {kind === 'history' ? <History size={28} /> : <Bookmark size={28} />}
          <h3>{kind === 'history' ? 'No watch history yet' : 'Your Watch Later list is empty'}</h3>
          <p>{kind === 'history' ? 'Videos you play in Kairo will appear here.' : 'Save videos from their watch page and they will appear here.'}</p>
          <Link to="/youtube" className="yt-button yt-button-primary">Explore videos</Link>
        </div>
      )}
      {!loading && items.length > 0 && (
        <div className="yt-library-list">
          {items.map(item => {
            const progress = item.durationSeconds && item.durationSeconds > 0
              ? Math.max(0, Math.min(100, Number(item.progressSeconds ?? 0) / item.durationSeconds * 100))
              : 0;
            return (
              <article className="yt-library-item" key={item.videoId}>
                <Link to={'/youtube/watch/' + item.videoId} className="yt-library-thumb" aria-label={'Open ' + item.title}>
                  {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" /> : <Youtube size={24} />}
                  {kind === 'history' && <span className="yt-library-progress"><i style={{ width: progress + '%' }} /></span>}
                </Link>
                <div className="yt-library-copy">
                  <Link to={'/youtube/watch/' + item.videoId}><h2>{item.title}</h2></Link>
                  <p>{item.channelTitle || 'YouTube'}</p>
                  <small>{kind === 'history' ? (Number(item.completed) === 1 ? 'Watched' : progress > 0 ? Math.round(progress) + '% watched' : 'Opened') : 'Saved to Watch Later'}</small>
                </div>
                <button type="button" className="yt-remove-button" onClick={() => void remove(item.videoId)} disabled={removing === item.videoId} aria-label={'Remove ' + item.title}>
                  <Trash2 size={16} />{removing === item.videoId ? 'Removing…' : 'Remove'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function YouTubeHistoryPage() {
  return <YouTubeLibrary kind="history" />;
}

export function YouTubeWatchLaterPage() {
  return <YouTubeLibrary kind="watch-later" />;
}
