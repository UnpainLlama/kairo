import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ExternalLink, RefreshCw, Youtube } from 'lucide-react';
import { EmptyState, LoadingState } from '../components/catalog';

type FeedVideo = {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string | null;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  url: string;
};
type FeedPayload = { videos: FeedVideo[]; nextPageToken: string | null; channelsChecked: number };

export default function YouTubeFeedPage() {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (pageToken: string | null, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const query = pageToken ? '?pageToken=' + encodeURIComponent(pageToken) : '';
      const response = await fetch('/api/v1/youtube/subscriptions/feed' + query, {
        credentials: 'same-origin', headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw { code: payload?.error?.code ?? 'FEED_UNAVAILABLE', message: payload?.error?.message ?? 'Could not load your subscriptions.' };
      }
      const data = payload.data as FeedPayload;
      setVideos(current => append ? [...current, ...(data.videos ?? [])] : (data.videos ?? []));
      setNextPageToken(data.nextPageToken ?? null);
    } catch (caught) {
      const issue = caught as { code?: string; message?: string };
      setError({ code: issue.code ?? 'FEED_UNAVAILABLE', message: issue.message ?? 'Could not load your subscriptions.' });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void load(null, false); }, [load, refreshKey]);

  const needsLogin = error?.code === 'AUTH_REQUIRED';
  const needsConnection = error?.code === 'YOUTUBE_NOT_CONNECTED';
  const needsReconnect = error?.code === 'YOUTUBE_REAUTH_REQUIRED';

  if (loading && videos.length === 0) return <LoadingState label="Loading YouTube subscriptions" />;

  return <section className="kc-youtube-page">
    <header className="kc-youtube-head">
      <div><span className="kc-section-kicker">YOUR MEDIA</span><h1><Youtube size={28} aria-hidden="true" /> YouTube</h1>
        <p>Recent uploads from channels you subscribe to.</p></div>
      <button className="kc-btn" type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading}><RefreshCw size={15} /> Refresh</button>
    </header>

    {error && <div className="kc-youtube-notice" role="alert"><AlertCircle size={18} /><div><b>{error.message}</b>
      {needsLogin && <p><Link className="kc-link" to="/login">Sign in</Link> to view your subscriptions.</p>}
      {needsConnection && <p><Link className="kc-link" to="/settings">Connect YouTube in Settings</Link> to get started.</p>}
      {needsReconnect && <p><Link className="kc-link" to="/settings">Reconnect YouTube in Settings</Link> to continue.</p>}
      {!needsLogin && !needsConnection && !needsReconnect && <p><button className="kc-link-button" type="button" onClick={() => setRefreshKey(value => value + 1)}>Try again</button></p>}
    </div></div>}

    {!error && videos.length === 0 && !loading && <EmptyState title="No recent uploads found">We couldn't find recent public uploads from the first channels in your subscriptions.</EmptyState>}

    <div className="kc-youtube-grid">
      {videos.map(video => <article className="kc-youtube-card" key={video.videoId}>
        <a className="kc-youtube-thumb" href={video.url} target="_blank" rel="noopener noreferrer" aria-label={'Watch ' + video.title + ' on YouTube'}>
          {video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy" /> : <span><Youtube size={28} /></span>}
          <i><ExternalLink size={13} /> Watch</i>
        </a>
        <div className="kc-youtube-copy">
          <a href={video.url} target="_blank" rel="noopener noreferrer"><h2>{video.title}</h2></a>
          <p>{video.channelTitle}</p>
          <small>{video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : 'Recently uploaded'}</small>
        </div>
      </article>)}
    </div>

    {nextPageToken && <div className="kc-youtube-more"><button className="kc-btn" type="button" disabled={loadingMore} onClick={() => void load(nextPageToken, true)}>{loadingMore ? 'Loading…' : 'Load more subscriptions'} </button></div>}
  </section>;
}
