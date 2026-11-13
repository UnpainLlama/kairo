import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Plus, RefreshCw, Youtube } from 'lucide-react';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';

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
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FeedError | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setSelectedChannel('all');
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
        return [...current, ...pageVideos.filter(video => !seen.has(video.videoId))]
          .sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''));
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

  const channelById = useMemo(() => new Map(channels.map(channel => [channel.channelId, channel])), [channels]);
  const relatedVideos: YouTubeCardVideo[] = useMemo(() => videos.map(video => ({
    videoId: video.videoId,
    title: video.title,
    thumbnailUrl: video.thumbnail,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt,
    durationSeconds: null,
  })), [videos]);
  const visibleVideos = selectedChannel === 'all'
    ? relatedVideos
    : relatedVideos.filter(video => video.channelId === selectedChannel);
  const selectedChannelTitle = channels.find(channel => channel.channelId === selectedChannel)?.title;
  const needsLogin = error?.code === 'AUTH_REQUIRED';

  return (
    <section className="yt-page yt-home-page">
      <header className="yt-page-heading yt-home-heading">
        <div>
          <h1>Home</h1>
          <p>Fresh uploads from the creators you follow.</p>
        </div>
        <div className="yt-heading-actions">
          <Link to="/youtube/search" className="yt-button yt-button-primary"><Plus size={15} /> Find videos</Link>
          <button className="yt-button yt-button-quiet" type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading || loadingMore}><RefreshCw size={15} /> Refresh</button>
        </div>
      </header>

      <nav className="yt-home-chips" aria-label="Filter videos by channel">
        <button type="button" className={selectedChannel === 'all' ? 'active' : ''} aria-pressed={selectedChannel === 'all'} onClick={() => setSelectedChannel('all')}>All</button>
        {channels.map(channel => (
          <button key={channel.channelId} type="button" className={selectedChannel === channel.channelId ? 'active' : ''} aria-pressed={selectedChannel === channel.channelId} onClick={() => setSelectedChannel(channel.channelId)}>
            {channel.title}
          </button>
        ))}
        <Link to="/youtube/channels" className="yt-home-chip-manage"><ArrowUpRight size={13} /> Manage channels</Link>
      </nav>

      {error && <div className="yt-notice" role="alert">
        <div><b>{error.message}</b>
          {needsLogin && <p><Link to="/login">Sign in</Link> to create your channel feed.</p>}
          {!needsLogin && <p><button type="button" className="yt-inline-action" onClick={() => error?.code === 'YOUTUBE_FEED_CURSOR_EXPIRED' || !nextCursor ? setRefreshKey(value => value + 1) : void loadMore()}>Try again</button></p>}
        </div>
      </div>}

      <section className="yt-feed-section">
        <div className="yt-section-heading yt-home-section-heading">
          <div><h2>{selectedChannelTitle ?? 'Latest videos'}</h2><p>{selectedChannelTitle ? 'Recent uploads from this channel' : 'Recommended from your subscriptions'}</p></div>
          <span>{visibleVideos.length.toLocaleString()} videos</span>
        </div>

        {loading && <div className="yt-video-grid yt-skeleton-grid" role="status" aria-label="Loading videos">
          {Array.from({ length: 8 }, (_, index) => <div className="yt-video-skeleton" key={index}><span /><i /><b /><small /></div>)}
        </div>}

        {!loading && !error && channels.length === 0 && <div className="yt-empty yt-home-empty">
          <Youtube size={30} /><h3>Your home feed starts with subscriptions</h3><p>Find creators you enjoy and add their channels. Their latest public uploads will appear here.</p>
          <Link to="/youtube/search" className="yt-button yt-button-primary"><Plus size={15} /> Find channels</Link>
        </div>}

        {!loading && !error && channels.length > 0 && videos.length === 0 && !nextCursor && <div className="yt-empty">
          <Youtube size={28} /><h3>No recent uploads yet</h3><p>When your selected channels publish new videos, they’ll appear here.</p>
        </div>}

        {!loading && !error && videos.length > 0 && visibleVideos.length === 0 && <div className="yt-empty">
          <Youtube size={25} /><h3>No videos from {selectedChannelTitle ?? 'this channel'} yet</h3><p>Choose another channel or switch back to All.</p>
          <button type="button" className="yt-button yt-button-quiet" onClick={() => setSelectedChannel('all')}>Show all videos</button>
        </div>}

        {!loading && visibleVideos.length > 0 && <div className="yt-video-grid">
          {visibleVideos.map(video => (
            <YouTubeVideoCard
              key={video.videoId}
              video={video}
              relatedVideos={relatedVideos}
              channelAvatarUrl={channelById.get(video.channelId ?? '')?.thumbnailUrl ?? null}
            />
          ))}
        </div>}

        {!loading && (videos.length > 0 || nextCursor) && <div className="yt-scroll-sentinel" ref={sentinelRef}>
          {loadingMore ? <div className="yt-loading" role="status">Loading more videos…</div> : nextCursor ? <button type="button" className="yt-button yt-button-quiet" onClick={() => void loadMore()}>Load more</button> : <p>You’re all caught up.</p>}
        </div>}
      </section>

      <section className="yt-channel-shelf" aria-label="Your selected channels">
        <div className="yt-section-heading"><div><h2>Subscriptions</h2><p>{channels.length} {channels.length === 1 ? 'channel' : 'channels'} in your feed</p></div><Link to="/youtube/channels">Manage <ArrowUpRight size={14} /></Link></div>
        {channels.length > 0 ? (
          <div className="yt-channel-bubbles">
            {channels.map(channel => <button type="button" className={'yt-channel-bubble' + (selectedChannel === channel.channelId ? ' active' : '')} key={channel.channelId} title={'Show ' + channel.title} onClick={() => { setSelectedChannel(channel.channelId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              {channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" loading="lazy" /> : <span>{channel.title.slice(0, 1).toUpperCase()}</span>}
              <small>{channel.title}</small>
            </button>)}
            <Link to="/youtube/search" className="yt-channel-add"><Plus size={19} /><span>Add</span></Link>
          </div>
        ) : (
          <div className="yt-channel-empty"><span className="yt-plus-orb"><Plus size={21} /></span><div><b>Build your subscriptions.</b><p>Find channels you like and add them to your feed.</p></div><Link to="/youtube/search" className="yt-button yt-button-primary">Find channels <ArrowUpRight size={15} /></Link></div>
        )}
      </section>
    </section>
  );
}
