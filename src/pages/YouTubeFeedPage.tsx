import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';
import { useAccountScope } from '../hooks/useAccountScope';
import { readGuestYouTubeHistory, type YouTubeLocalVideo } from '../lib/youtubeLocalLibrary';
import { buildRecommendationFeed, type RecommendationCandidate, type RecommendedVideo } from '../lib/youtubeRecommendations';

type HistoryVideo = YouTubeLocalVideo & { updatedAt: number };
type DiscoverySeed = { query: string; channelId: string | null; channelTitle: string; reason: string };
type DiscoveryVideo = RecommendedVideo;
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
  const [error, setError] = useState<FeedError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!resolved && !accountError) return;
    setLoading(true);
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

      const candidates: RecommendationCandidate[] = successful.flatMap(({ seed, videos }) =>
        videos.map(video => ({ video, seedTitle: seed.query })),
      );
      const mixed = buildRecommendationFeed({
        history: recentHistory,
        candidates,
        seed: refreshKey + 1,
        limit: 60,
      });
      setVideos(mixed);
      if (mixed.length === 0 && recentHistory.length > 0) {
        setError({ message: 'We could not find fresh videos from those topics yet. Try Search to explore more creators.' });
      }
    } catch (caught) {
      if (!signal.aborted) {
        setError({ message: caught instanceof Error ? caught.message : 'Could not load your recommendations.' });
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [accountId, accountError, refreshKey, resolved]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const shorts = useMemo(() => videos.filter(isShort).slice(0, 5), [videos]);
  const regularVideos = useMemo(() => videos.filter(video => !isShort(video)), [videos]);

  return (
    <section className="yt-page yt-home-page yt-home-redesign">
      {error && (
        <div className="yt-notice" role="alert">
          <div>
            <b>{error.message}</b>
            <p><button type="button" className="yt-inline-action" onClick={() => setRefreshKey(value => value + 1)}>Try again</button></p>
          </div>
        </div>
      )}

      {loading && (
        <div className="yt-video-grid yt-feed-grid yt-skeleton-grid" role="status" aria-label="Loading recommendations">
          {Array.from({ length: 8 }, (_, index) => <div className="yt-video-skeleton" key={index}><span /><i /><b /><small /></div>)}
        </div>
      )}

      {!loading && !error && history.length === 0 && (
        <div className="yt-first-visit-empty">
          <div className="yt-first-visit-panel">
            <h2>Try searching to get started</h2>
            <p>Start watching videos to help us build a feed of videos you'll love.</p>
          </div>
        </div>
      )}

      {!loading && !error && history.length > 0 && shorts.length > 0 && (
        <section className="yt-shorts-section" aria-label="Shorts">
          <div className="yt-section-heading"><h2>Shorts</h2></div>
          <div className="yt-shorts-strip">
            {shorts.map(video => (
              <Link key={video.videoId} to={'/youtube/watch/' + video.videoId} className="yt-short-card" state={{ youtubeRelatedVideos: videos, youtubeCurrentVideo: video }}>
                {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : <span className="yt-short-placeholder" />}
                <span className="yt-short-copy"><b>{video.title}</b><small>{video.channelTitle}</small></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && regularVideos.length > 0 && (
        <section className="yt-feed-section">
          <div className="yt-video-grid yt-feed-grid">
            {regularVideos.map(video => (
              <YouTubeVideoCard key={video.videoId} video={video} relatedVideos={videos} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
