import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw, Sparkles, Youtube } from 'lucide-react';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';
import { useAccountScope } from '../hooks/useAccountScope';
import { readGuestYouTubeHistory, type YouTubeLocalVideo } from '../lib/youtubeLocalLibrary';

type HistoryVideo = YouTubeLocalVideo & { updatedAt: number };
type DiscoverySeed = { query: string; channelId: string | null; channelTitle: string; reason: string };
type DiscoveryVideo = YouTubeCardVideo & { recommendationReason: string };
type SearchFilter = 'all' | 'shorts' | 'videos' | 'recent';
type FeedError = { message: string };

function isShort(video: Pick<YouTubeCardVideo, 'title' | 'description'>): boolean {
  return /(?:^|\s)#(?:youtube)?shorts?\b/i.test((video.title || '') + ' ' + (video.description || ''));
}

function buildDiscoverySeeds(history: HistoryVideo[]): DiscoverySeed[] {
  const recent = [...history].sort((a, b) => b.updatedAt - a.updatedAt);
  const seeds: DiscoverySeed[] = [];
  const seenChannels = new Set<string>();
  const seenQueries = new Set<string>();

  for (const item of recent) {
    const title = item.title.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (title.length < 2) continue;
    const channelId = typeof item.channelId === 'string' && item.channelId.length > 0 ? item.channelId : null;
    const channelTitle = item.channelTitle?.trim() || 'a channel you watched';
    const key = title.toLowerCase();
    if (seenQueries.has(key) || (channelId && seenChannels.has(channelId))) continue;
    seenQueries.add(key);
    if (channelId) seenChannels.add(channelId);
    seeds.push({
      query: title,
      channelId,
      channelTitle,
      reason: 'Because you watched ' + channelTitle,
    });
    if (seeds.length === 3) break;
  }

  // When most recent history comes from one creator, use a few distinct video topics
  // from that creator rather than repeatedly searching the exact same channel.
  if (seeds.length < 3) {
    for (const item of recent) {
      const title = item.title.trim().replace(/\s+/g, ' ').slice(0, 80);
      const key = title.toLowerCase();
      if (title.length < 2 || seenQueries.has(key)) continue;
      seenQueries.add(key);
      seeds.push({
        query: title,
        channelId: typeof item.channelId === 'string' ? item.channelId : null,
        channelTitle: item.channelTitle?.trim() || 'a channel you watched',
        reason: 'More like ' + (item.channelTitle?.trim() || 'your recent watches'),
      });
      if (seeds.length === 3) break;
    }
  }

  return seeds;
}

function mixResults(buckets: Array<{ seed: DiscoverySeed; videos: YouTubeCardVideo[] }>, watchedIds: Set<string>): DiscoveryVideo[] {
  const positions = buckets.map(() => 0);
  const channelCounts = new Map<string, number>();
  const seenVideos = new Set<string>(watchedIds);
  const mixed: DiscoveryVideo[] = [];
  let hasMore = true;

  while (hasMore && mixed.length < 24) {
    hasMore = false;
    for (let bucketIndex = 0; bucketIndex < buckets.length && mixed.length < 24; bucketIndex += 1) {
      const bucket = buckets[bucketIndex];
      const list = bucket.videos;
      let candidate: YouTubeCardVideo | undefined;

      while (positions[bucketIndex] < list.length) {
        const next = list[positions[bucketIndex]];
        positions[bucketIndex] += 1;
        if (seenVideos.has(next.videoId)) continue;
        const channelKey = next.channelId || next.channelTitle || 'unknown';
        if ((channelCounts.get(channelKey) ?? 0) >= 2) continue;
        candidate = next;
        break;
      }

      if (candidate) {
        hasMore = true;
        seenVideos.add(candidate.videoId);
        const channelKey = candidate.channelId || candidate.channelTitle || 'unknown';
        channelCounts.set(channelKey, (channelCounts.get(channelKey) ?? 0) + 1);
        mixed.push({
          ...candidate,
          recommendationReason: bucket.seed.reason,
        });
      } else if (positions[bucketIndex] < list.length) {
        hasMore = true;
      }
    }
  }

  return mixed;
}

async function readWatchHistory(accountId: string | null): Promise<HistoryVideo[]> {
  if (!accountId) return readGuestYouTubeHistory() as HistoryVideo[];
  const response = await fetch('/api/v1/youtube/history', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message ?? 'Your watch history could not be loaded.');
  }
  return Array.isArray(payload.data?.items) ? payload.data.items as HistoryVideo[] : [];
}

async function searchSeed(seed: DiscoverySeed): Promise<YouTubeCardVideo[]> {
  const params = new URLSearchParams({ q: seed.query, order: 'relevance', duration: 'any' });
  const response = await fetch('/api/v1/youtube/videos/search?' + params.toString(), {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message ?? 'YouTube recommendations are temporarily unavailable.');
  }
  return Array.isArray(payload.data?.videos) ? payload.data.videos as YouTubeCardVideo[] : [];
}

export default function YouTubeFeedPage() {
  const { accountId, resolved, error: accountError } = useAccountScope();
  const [history, setHistory] = useState<HistoryVideo[]>([]);
  const [videos, setVideos] = useState<DiscoveryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FeedError | null>(null);
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!resolved && !accountError) return;
    setLoading(true);
    setRefreshing(refreshKey > 0);
    setError(null);
    setVideos([]);

    try {
      if (accountError) throw new Error('Kairo could not verify your account. Reconnect and reload to use your personal recommendations.');
      const recentHistory = await readWatchHistory(accountId);
      if (signal.aborted) return;
      setHistory(recentHistory);
      const seeds = buildDiscoverySeeds(recentHistory);
      if (seeds.length === 0) {
        setVideos([]);
        return;
      }
      const settled = await Promise.allSettled(seeds.map(async (seed) => ({
        seed,
        videos: await searchSeed(seed),
      })));
      if (signal.aborted) return;

      const successful = settled
        .filter((result): result is PromiseFulfilledResult<{ seed: DiscoverySeed; videos: YouTubeCardVideo[] }> => result.status === 'fulfilled')
        .map(result => result.value);
      if (successful.length === 0) {
        const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw new Error(failed?.reason instanceof Error ? failed.reason.message : 'No recommendations could be loaded. Please try again.');
      }

      const watchedIds = new Set(recentHistory.map(item => item.videoId));
      const mixed = mixResults(successful, watchedIds);
      setVideos(mixed);
      if (mixed.length === 0 && recentHistory.length > 0) {
        setError({ message: 'We could not find fresh videos from those topics yet. Try Search to explore more creators.' });
      }
    } catch (caught) {
      if (!signal.aborted) {
        setError({ message: caught instanceof Error ? caught.message : 'Could not load your recommendations.' });
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accountId, accountError, refreshKey, resolved]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const visibleVideos = useMemo(() => {
    if (filter === 'shorts') return videos.filter(isShort);
    if (filter === 'videos') return videos.filter(video => !isShort(video));
    if (filter === 'recent') {
      return [...videos].sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''));
    }
    return videos;
  }, [filter, videos]);

  const shorts = useMemo(() => videos.filter(isShort).slice(0, 8), [videos]);
  const recentCreators = useMemo(() => {
    const seen = new Set<string>();
    return history.filter(item => {
      if (!item.channelId || seen.has(item.channelId)) return false;
      seen.add(item.channelId);
      return true;
    }).slice(0, 6);
  }, [history]);

  const filters: Array<{ id: SearchFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'shorts', label: 'Shorts' },
    { id: 'videos', label: 'Videos' },
    { id: 'recent', label: 'Recently uploaded' },
  ];

  return (
    <section className="yt-page yt-home-page yt-home-redesign">
      <header className="yt-page-heading yt-home-heading">
        <div className="yt-home-title-block">
          <span className="yt-eyebrow">A MIX BUILT AROUND WHAT YOU WATCH</span>
          <h1>For you</h1>
          <p>
            {history.length > 0
              ? 'Discover videos and new creators inspired by your recent watches.'
              : 'Watch a few videos and Kairo will start finding channels and topics with a similar feel.'}
          </p>
        </div>
        <div className="yt-heading-actions">
          <Link to="/youtube/search" className="yt-button yt-button-primary">Explore videos <ArrowUpRight size={15} /></Link>
          <button className="yt-button yt-button-quiet" type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading || refreshing}>
            <RefreshCw size={15} className={refreshing ? 'yt-refresh-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      <nav className="yt-home-chips yt-home-filter-chips" aria-label="Filter recommendations">
        {filters.map(item => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? 'active' : ''}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span className="yt-filter-divider" aria-hidden="true" />
        <Link to="/youtube/search?q=music">Music</Link>
        <Link to="/youtube/search?q=gaming">Gaming</Link>
        <Link to="/youtube/search?q=podcasts">Podcasts</Link>
        <Link to="/youtube/search?q=technology">Technology</Link>
        <Link to="/youtube/search?q=science">Science</Link>
      </nav>

      {recentCreators.length > 0 && (
        <section className="yt-visited-creators" aria-label="Recently watched creators">
          <div className="yt-section-heading">
            <div><h2>Creators you’ve visited</h2><p>Your recent watches help shape the mix</p></div>
            <Link to="/youtube/channels">View all <ArrowUpRight size={14} /></Link>
          </div>
          <div className="yt-visited-creator-strip">
            {recentCreators.map(creator => (
              <a key={creator.channelId} href={'https://www.youtube.com/channel/' + encodeURIComponent(creator.channelId)} target="_blank" rel="noopener noreferrer" className="yt-visited-creator">
                <span>{creator.channelTitle.trim().slice(0, 1).toUpperCase() || 'Y'}</span>
                <small>{creator.channelTitle}</small>
              </a>
            ))}
          </div>
        </section>
      )}

      {error && <div className="yt-notice" role="alert"><div><b>{error.message}</b><p><button type="button" className="yt-inline-action" onClick={() => setRefreshKey(value => value + 1)}>Try again</button></p></div></div>}

      {loading && (
        <div className="yt-video-grid yt-feed-grid yt-skeleton-grid" role="status" aria-label="Loading recommendations">
          {Array.from({ length: 8 }, (_, index) => <div className="yt-video-skeleton" key={index}><span /><i /><b /><small /></div>)}
        </div>
      )}

      {!loading && shorts.length > 0 && filter === 'all' && (
        <section className="yt-shorts-section" aria-label="Shorts inspired by your watch history">
          <div className="yt-section-heading">
            <div><h2>Shorts</h2><p>Quick videos from topics you’ve watched</p></div>
            <Link to="/youtube/search?q=shorts">Explore Shorts <ArrowUpRight size={14} /></Link>
          </div>
          <div className="yt-shorts-strip">
            {shorts.map(video => (
              <Link key={video.videoId} to={'/youtube/watch/' + video.videoId} className="yt-short-card" state={{ youtubeRelatedVideos: videos, youtubeCurrentVideo: video }}>
                {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : <span className="yt-short-placeholder"><Youtube size={24} /></span>}
                <span className="yt-short-copy"><b>{video.title}</b><small>{video.channelTitle}</small></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="yt-feed-section yt-recommendations-section">
        <div className="yt-section-heading yt-home-section-heading">
          <div><h2>{filter === 'shorts' ? 'Shorts' : filter === 'videos' ? 'Videos for you' : filter === 'recent' ? 'Recently uploaded' : 'Picked for you'}</h2>
            <p>{history.length > 0 ? 'A balanced mix from creators and subjects related to your watch history' : 'Popular picks to get your recommendations started'}</p>
          </div>
          <span>{visibleVideos.length.toLocaleString()} videos</span>
        </div>

        {!loading && !error && history.length === 0 && (
          <div className="yt-first-visit-empty">
            <div className="yt-first-visit-panel">
              <span className="yt-first-visit-icon"><Sparkles size={22} /></span>
              <h2>Try searching to get started</h2>
              <p>Start watching videos to help Kairo build a feed of videos and creators you’ll love.</p>
              <Link to="/youtube/search" className="yt-button yt-button-primary">Search videos <ArrowUpRight size={15} /></Link>
            </div>
          </div>
        )}

        {!loading && !error && history.length > 0 && visibleVideos.length === 0 && (
          <div className="yt-empty">
            <Youtube size={28} />
            <h3>{filter === 'shorts' ? 'No labelled Shorts in this mix yet' : 'No recommendations to show'}</h3>
            <p>{filter === 'shorts' ? 'Try All or explore Shorts from Search. Public YouTube data does not identify every Short reliably.' : 'Try a different topic or refresh your recommendations.'}</p>
            <button type="button" className="yt-button yt-button-quiet" onClick={() => setFilter('all')}>Show all</button>
          </div>
        )}

        {!loading && visibleVideos.length > 0 && (
          <div className="yt-video-grid yt-feed-grid">
            {visibleVideos.map(video => (
              <article className="yt-recommendation-card" key={video.videoId}>
                <span className="yt-recommendation-reason">{video.recommendationReason}</span>
                <YouTubeVideoCard video={video} relatedVideos={videos} />
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
