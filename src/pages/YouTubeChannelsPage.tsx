import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3, Users, Youtube } from 'lucide-react';
import { useAccountScope } from '../hooks/useAccountScope';
import { readGuestYouTubeHistory, type YouTubeLocalVideo } from '../lib/youtubeLocalLibrary';

type HistoryVideo = YouTubeLocalVideo & { updatedAt: number };
type WatchedCreator = {
  channelId: string;
  title: string;
  videoCount: number;
  lastWatchedAt: number;
  latestVideoTitle: string;
};

async function loadHistory(accountId: string | null): Promise<HistoryVideo[]> {
  if (!accountId) return readGuestYouTubeHistory() as HistoryVideo[];
  const response = await fetch('/api/v1/youtube/history', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not load your watch history.');
  return Array.isArray(payload.data?.items) ? payload.data.items as HistoryVideo[] : [];
}

export default function YouTubeChannelsPage() {
  const { accountId, resolved, error: accountError } = useAccountScope();
  const [history, setHistory] = useState<HistoryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!resolved && !accountError) return;
    setLoading(true);
    setError('');
    try {
      if (accountError) throw new Error('Kairo could not verify your account. Reconnect and reload to view your creator history.');
      setHistory(await loadHistory(accountId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your creator history.');
    } finally {
      setLoading(false);
    }
  }, [accountError, accountId, resolved]);

  useEffect(() => { void load(); }, [load]);

  const creators = useMemo(() => {
    const index = new Map<string, WatchedCreator>();
    for (const item of history) {
      if (!item.channelId) continue;
      const current = index.get(item.channelId);
      if (current) {
        current.videoCount += 1;
        if (item.updatedAt > current.lastWatchedAt) {
          current.lastWatchedAt = item.updatedAt;
          current.latestVideoTitle = item.title;
        }
      } else {
        index.set(item.channelId, {
          channelId: item.channelId,
          title: item.channelTitle || 'YouTube creator',
          videoCount: 1,
          lastWatchedAt: item.updatedAt,
          latestVideoTitle: item.title,
        });
      }
    }
    return Array.from(index.values()).sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
  }, [history]);

  return (
    <section className="yt-page yt-creators-page">
      <header className="yt-page-heading">
        <div>
          <span className="yt-eyebrow">YOUR WATCH HISTORY</span>
          <h1>Creators you’ve visited</h1>
          <p>Channels appear here automatically when you watch their videos in Kairo. They help shape your recommendations.</p>
        </div>
        <Link to="/youtube/search" className="yt-button yt-button-primary">Explore channels <ArrowUpRight size={15} /></Link>
      </header>

      <div className="yt-creator-summary">
        <Users size={17} />
        <span><b>{creators.length}</b> creators found in your watch history</span>
      </div>

      {error && <div className="yt-notice" role="alert">{error}</div>}
      {loading && <div className="yt-loading" role="status">Loading watched creators…</div>}

      {!loading && !error && creators.length === 0 && (
        <div className="yt-empty">
          <Youtube size={28} />
          <h3>Your creator history starts here</h3>
          <p>Watch a few videos and the channels you visit will show up here automatically. You do not need to subscribe or build a manual feed.</p>
          <Link to="/youtube/search" className="yt-button yt-button-primary">Find videos</Link>
        </div>
      )}

      {!loading && !error && creators.length > 0 && (
        <div className="yt-creator-grid">
          {creators.map(creator => (
            <article className="yt-creator-card" key={creator.channelId}>
              <a className="yt-creator-avatar" href={'https://www.youtube.com/channel/' + encodeURIComponent(creator.channelId)} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + creator.title + ' on YouTube'}>
                {creator.title.trim().slice(0, 1).toUpperCase() || 'Y'}
              </a>
              <div className="yt-creator-copy">
                <h2>{creator.title}</h2>
                <p>{creator.videoCount} {creator.videoCount === 1 ? 'video watched' : 'videos watched'}</p>
                <small><Clock3 size={12} /> Last visited {new Date(creator.lastWatchedAt).toLocaleDateString()}</small>
                <span className="yt-creator-latest">{creator.latestVideoTitle}</span>
              </div>
              <a className="yt-creator-open" href={'https://www.youtube.com/channel/' + encodeURIComponent(creator.channelId)} target="_blank" rel="noopener noreferrer">Open channel <ArrowUpRight size={14} /></a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
