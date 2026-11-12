import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Plus, RefreshCw, Youtube } from 'lucide-react';

type SavedChannel = { channelId: string; title: string; description: string; thumbnailUrl: string | null; addedAt?: string };
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
type FeedError = { code: string; message: string };

export default function YouTubeFeedPage() {
  const [channels, setChannels] = useState<SavedChannel[]>([]);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FeedError | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setVideos([]);
    setNextCursor(null);
    try {
      const [channelsResponse, feedResponse] = await Promise.all([
        fetch('/api/v1/youtube/channels', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
        fetch('/api/v1/youtube/feed', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
      ]);
      const channelsPayload = await channelsResponse.json().catch(() => null);
      if (!channelsResponse.ok || !channelsPayload?.success) {
        throw { code: channelsPayload?.error?.code ?? 'YOUTUBE_CHANNELS_UNAVAILABLE', message: channelsPayload?.error?.message ?? 'Could not load your channels.' };
      }
      setChannels(channelsPayload.data?.channels ?? []);
      const feedPayload = await feedResponse.json().catch(() => null);
      if (!feedResponse.ok || !feedPayload?.success) {
        throw { code: feedPayload?.error?.code ?? 'YOUTUBE_FEED_UNAVAILABLE', message: feedPayload?.error?.message ?? 'Could not load your feed.' };
      }
      setVideos(feedPayload.data?.videos ?? []);
      setNextCursor(feedPayload.data?.nextCursor ?? null);
    } catch (caught) {
      const issue = caught as { code?: string; message?: string };
      setError({ code: issue.code ?? 'YOUTUBE_FEED_UNAVAILABLE', message: issue.message ?? 'Could not load your YouTube feed.' });
      setVideos([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/youtube/feed?cursor=' + encodeURIComponent(nextCursor), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw { code: payload?.error?.code ?? 'YOUTUBE_FEED_UNAVAILABLE', message: payload?.error?.message ?? 'Could not load more videos.' };
      }
      const pageVideos = (payload.data?.videos ?? []) as FeedVideo[];
      setVideos(current => {
        const seen = new Set(current.map(video => video.videoId));
        return [...current, ...pageVideos.filter(video => !seen.has(video.videoId))];
      });
      setNextCursor(payload.data?.nextCursor ?? null);
    } catch (caught) {
      const issue = caught as { code?: string; message?: string };
      setError({ code: issue.code ?? 'YOUTUBE_FEED_UNAVAILABLE', message: issue.message ?? 'Could not load more videos.' });
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor]);

  useEffect(() => {
    if (!nextCursor || loading || loadingMore || error) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '700px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, loadMore, loading, loadingMore, nextCursor, videos.length]);

  const needsLogin = error?.code === 'AUTH_REQUIRED';
  const needsConnection = error?.code === 'YOUTUBE_NOT_CONNECTED';
  const needsReconnect = error?.code === 'YOUTUBE_REAUTH_REQUIRED';

  return (
    <section className="yt-page">
      <header className="yt-page-heading">
        <div><span className="yt-eyebrow">YOUR VIDEO SPACE</span><h1>Home</h1><p>A feed built from the channels you choose.</p></div>
        <div className="yt-heading-actions">
          <Link to="/youtube/search" className="yt-button yt-button-primary"><Plus size={15} /> Add channels</Link>
          <button className="yt-button yt-button-quiet" type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        </div>
      </header>

      {error && <div className="yt-notice" role="alert">
        <div><b>{error.message}</b>
          {needsLogin && <p><Link to="/login">Sign in</Link> to create your channel feed.</p>}
          {needsConnection && <p><a href="/api/v1/auth/youtube">Connect YouTube</a> to search channels and fetch their latest uploads.</p>}
          {needsReconnect && <p><a href="/api/v1/auth/youtube">Reconnect YouTube</a> to continue.</p>}
          {!needsLogin && !needsConnection && !needsReconnect && <p><button type="button" className="yt-inline-action" onClick={() => nextCursor ? void loadMore() : setRefreshKey(value => value + 1)}>Try again</button></p>}
        </div>
      </div>}

      <section className="yt-channel-shelf" aria-label="Your selected channels">
        <div className="yt-section-heading"><div><h2>Your channels</h2><p>{channels.length} {channels.length === 1 ? 'channel' : 'channels'} in your feed</p></div><Link to="/youtube/channels">Manage <ArrowUpRight size={14} /></Link></div>
        {channels.length > 0 ? (
          <div className="yt-channel-bubbles">
            {channels.slice(0, 12).map(channel => <Link to="/youtube/channels" className="yt-channel-bubble" key={channel.channelId} title={channel.title}>
              {channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" loading="lazy" /> : <span>{channel.title.slice(0, 1).toUpperCase()}</span>}
              <small>{channel.title}</small>
            </Link>)}
            <Link to="/youtube/search" className="yt-channel-add"><Plus size={19} /><span>Add</span></Link>
          </div>
        ) : (
          <div className="yt-channel-empty"><span className="yt-plus-orb"><Plus size={21} /></span><div><b>Your feed starts with a few good channels.</b><p>Find creators you like and add them to your Kairo feed.</p></div><Link to="/youtube/search" className="yt-button yt-button-primary">Find channels <ArrowUpRight size={15} /></Link></div>
        )}
      </section>

      <section className="yt-feed-section">
        <div className="yt-section-heading"><div><h2>Latest videos</h2><p>{channels.length ? 'Recent uploads from your selected channels' : 'Your videos will show up here'}</p></div></div>
        {loading && <div className="yt-loading" role="status">Loading your feed…</div>}
        {!loading && !error && channels.length > 0 && videos.length === 0 && !nextCursor && <div className="yt-empty"><Youtube size={28} /><h3>No recent uploads yet</h3><p>When your selected channels publish new videos, they’ll appear here.</p></div>}
        {!loading && videos.length > 0 && <>
          <div className="yt-video-grid">
            {videos.map(video => <article className="yt-video-card" key={video.videoId}>
              <a className="yt-video-thumb" href={video.url} target="_blank" rel="noopener noreferrer" aria-label={'Watch ' + video.title + ' on YouTube'}>
                {video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy" /> : <span><Youtube size={30} /></span>}
                <i>Watch <ArrowUpRight size={13} /></i>
              </a>
              <div className="yt-video-copy">
                <h3><a href={video.url} target="_blank" rel="noopener noreferrer">{video.title}</a></h3>
                <p>{video.channelTitle}</p>
                <small>{video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : 'Recently uploaded'}</small>
              </div>
            </article>)}
          </div>

        </>}
        {!loading && (videos.length > 0 || nextCursor) && <div className="yt-scroll-sentinel" ref={sentinelRef}>
          {loadingMore ? <div className="yt-loading" role="status">Loading more videos…</div> : nextCursor ? <button type="button" className="yt-button yt-button-quiet" onClick={() => void loadMore()}>Load more</button> : <p>You’re all caught up.</p>}
        </div>}
      </section>
    </section>
  );
}
