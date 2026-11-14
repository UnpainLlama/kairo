import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bookmark, History, Trash2, Youtube } from 'lucide-react';
import { useAccountScope } from '../hooks/useAccountScope';
import {
  readGuestYouTubeHistory, readGuestYouTubeWatchLater,
  removeGuestYouTubeHistory, removeGuestYouTubeWatchLater,
  YOUTUBE_LOCAL_CHANGE, type YouTubeLocalVideo,
} from '../lib/youtubeLocalLibrary';

type LibraryVideo = YouTubeLocalVideo & {
  completed?: number | boolean;
  updatedAt?: number;
  savedAt?: number;
};
type LibraryKind = 'history' | 'watch-later';

function YouTubeLibrary({ kind }: { kind: LibraryKind }) {
  const { accountId, resolved, error: accountError } = useAccountScope();
  const [items, setItems] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const path = kind === 'history' ? '/api/v1/youtube/history' : '/api/v1/youtube/watch-later';
  const title = kind === 'history' ? 'Watch history' : 'Watch Later';

  const load = useCallback(async () => {
    if (!resolved || accountError) return;
    setLoading(true);
    setError('');
    setItems([]);
    try {
      if (!accountId) {
        setItems(kind === 'history' ? readGuestYouTubeHistory() : readGuestYouTubeWatchLater());
        return;
      }
      const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not load your videos.');
      setItems(payload.data?.items ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your videos.');
    } finally {
      setLoading(false);
    }
  }, [accountId, accountError, kind, path, resolved]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (!accountId) void load(); };
    window.addEventListener(YOUTUBE_LOCAL_CHANGE, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(YOUTUBE_LOCAL_CHANGE, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [accountId, load]);

  const remove = async (videoId: string) => {
    setRemoving(videoId);
    setError('');
    try {
      if (!accountId) {
        if (kind === 'history') removeGuestYouTubeHistory(videoId);
        else removeGuestYouTubeWatchLater(videoId);
        setItems(current => current.filter(item => item.videoId !== videoId));
        return;
      }
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
      {!resolved && !accountError && <div className="yt-loading" role="status">Checking your Kairo account…</div>}
      {accountError && <div className="yt-notice" role="alert">Could not verify your Kairo account. Your local library is locked to avoid mixing guest and account data. Reload after reconnecting.</div>}
      {resolved && !accountId && <div className="yt-notice" role="note">This guest list stays in this browser. After signing in, new YouTube activity is saved to your Kairo account and syncs across devices.</div>}
      {resolved && accountId && <div className="yt-notice" role="note">This list is saved with your Kairo account and syncs across Anime, Movies and YouTube.</div>}
      {error && <div className="yt-notice" role="alert">{error}</div>}
      {loading && resolved && <div className="yt-loading" role="status">Loading your videos…</div>}
      {resolved && !accountError && !loading && !error && items.length === 0 && (
        <div className="yt-empty">
          {kind === 'history' ? <History size={28} /> : <Bookmark size={28} />}
          <h3>{kind === 'history' ? 'No watch history yet' : 'Your Watch Later list is empty'}</h3>
          <p>{kind === 'history' ? 'Videos you play in Kairo will appear here.' : 'Save videos from their watch page and they will appear here.'}</p>
          <Link to="/youtube" className="yt-button yt-button-primary">Explore videos</Link>
        </div>
      )}
      {resolved && !accountError && !loading && items.length > 0 && (
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
                  <small>{kind === 'history' ? (Number(item.completed) === 1 || item.completed === true ? 'Watched' : progress > 0 ? Math.round(progress) + '% watched' : 'Opened') : 'Saved to Watch Later'}</small>
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
