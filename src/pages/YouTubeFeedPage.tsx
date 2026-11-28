import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';
import { useAccountScope } from '../hooks/useAccountScope';
import {
  readGuestRecommendationState,
  readGuestYouTubeHistory,
  saveGuestRecommendationCache,
  saveGuestRecommendationState,
  type YouTubeLocalVideo,
} from '../lib/youtubeLocalLibrary';
import {
  buildRecommendationFeed,
  DEFAULT_RECOMMENDATION_TUNING,
  type RecommendationCandidate,
  type RecommendationFeedback,
  type RecommendationTopic,
  type RecommendationTuning,
  type RecommendedVideo,
} from '../lib/youtubeRecommendations';

type HistoryVideo = YouTubeLocalVideo & { updatedAt: number };
type DiscoverySeed = { query: string; channelId: string | null; channelTitle: string; reason: string };
type DiscoveryVideo = RecommendedVideo;
type FeedError = { message: string };
type FeedMixRow = { key: string; label: string; requested: number; actual: number; count: number };

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
  const [mixSummary, setMixSummary] = useState<FeedMixRow[]>([]);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!resolved && !accountError) return;
    setLoading(true);
    setError(null);
    setVideos([]);
    setMixSummary([]);

    try {
      if (accountError) throw new Error('Kairo could not verify your account. Reconnect and reload to use your personal recommendations.');
      let recentHistory: HistoryVideo[];
      let candidates: RecommendationCandidate[] = [];
      let topics: RecommendationTopic[] = [];
      let feedback: RecommendationFeedback = {};
      let impressions: Record<string, number> = {};
      let tuning: RecommendationTuning = DEFAULT_RECOMMENDATION_TUNING;

      if (accountId) {
        const response = await fetch('/api/v1/youtube/recommendations', {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error?.message ?? 'Your recommendations could not be loaded.');
        }
        const data = payload.data ?? {};
        recentHistory = Array.isArray(data.history) ? data.history as HistoryVideo[] : [];
        candidates = (Array.isArray(data.candidates) ? data.candidates : []).map((item: Record<string, unknown>) => ({
          video: {
            videoId: String(item.videoId ?? ''),
            title: String(item.title ?? ''),
            description: String(item.description ?? ''),
            thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
            channelId: typeof item.channelId === 'string' ? item.channelId : undefined,
            channelTitle: String(item.channelTitle ?? 'YouTube'),
            publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
            durationSeconds: typeof item.durationSeconds === 'number' ? item.durationSeconds : null,
          },
          seedTitle: typeof item.seedTitle === 'string' ? item.seedTitle : null,
          source: item.source === 'channel_uploads' ? 'channel_uploads' : 'search',
        }));
        topics = (Array.isArray(data.topics) ? data.topics : []).map((item: Record<string, unknown>) => ({
          id: String(item.id ?? ''),
          text: String(item.topic ?? ''),
          kind: item.kind === 'block' ? 'block' : 'interest',
          share: typeof item.share === 'number' ? item.share : 0,
          expiresAt: typeof item.expiresAt === 'number' ? item.expiresAt : null,
        }));
        const feedbackRows = Array.isArray(data.feedback) ? data.feedback as Array<{ targetType: string; targetId: string; action: string }> : [];
        feedback = {
          notInterestedVideoIds: feedbackRows.filter(item => item.targetType === 'video' && item.action === 'not_interested').map(item => item.targetId),
          blockedChannelIds: feedbackRows.filter(item => item.action === 'dont_recommend_channel').map(item => item.targetId),
          dismissedChannelIds: feedbackRows.filter(item => item.action === 'dismiss_channel').map(item => item.targetId),
        };
        impressions = Object.fromEntries(
          (Array.isArray(data.impressions) ? data.impressions : [])
            .filter((item: Record<string, unknown>) => typeof item.videoId === 'string')
            .map((item: Record<string, unknown>) => [String(item.videoId), Number(item.impressionCount) || 0]),
        );
        const saved = data.settings?.tuning;
        if (saved && typeof saved === 'object') {
          tuning = {
            ...DEFAULT_RECOMMENDATION_TUNING,
            ...(saved as Partial<RecommendationTuning>),
            shares: {
              ...DEFAULT_RECOMMENDATION_TUNING.shares,
              ...((saved as Partial<RecommendationTuning>).shares ?? {}),
            },
          };
        }
      } else {
        recentHistory = await readWatchHistory(null);
        const guestState = readGuestRecommendationState();
        topics = guestState.topics.map(topic => ({
          id: topic.id,
          text: topic.topic,
          kind: topic.kind,
          share: topic.share,
          expiresAt: topic.expiresAt,
        }));
        feedback = guestState.feedback;
        impressions = guestState.impressions;
        tuning = {
          ...DEFAULT_RECOMMENDATION_TUNING,
          ...(guestState.tuning as Partial<RecommendationTuning>),
          shares: {
            ...DEFAULT_RECOMMENDATION_TUNING.shares,
            ...((guestState.tuning as Partial<RecommendationTuning>).shares ?? {}),
          },
        };
        candidates = guestState.candidateCache;
        if (guestState.nextGatherAt <= Date.now()) {
          const seeds = buildDiscoverySeeds(recentHistory);
          if (seeds.length > 0) {
            const settled = await Promise.allSettled(seeds.map(async (seed) => ({
              seed,
              videos: await searchSeed(seed),
            })));
            if (signal.aborted) return;
            const successful = settled
              .filter((result): result is PromiseFulfilledResult<{ seed: DiscoverySeed; videos: YouTubeCardVideo[] }> => result.status === 'fulfilled')
              .map(result => result.value);
            if (successful.length > 0) {
              candidates = successful.flatMap(({ seed, videos }) =>
                videos.map(video => ({ video, seedTitle: seed.query, source: 'search' as const })),
              );
              saveGuestRecommendationCache(candidates, Date.now() + (candidates.length > 0 ? 6 : 1) * 60 * 60 * 1000);
            } else {
              // Keep the last usable pool if search is temporarily unavailable; retry after one hour.
              saveGuestRecommendationCache(candidates, Date.now() + 60 * 60 * 1000);
              if (candidates.length === 0) {
                const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
                throw new Error(failed?.reason instanceof Error ? failed.reason.message : 'No recommendations could be loaded. Please try again.');
              }
            }
          } else {
            saveGuestRecommendationCache(candidates, Date.now() + 60 * 60 * 1000);
          }
        }
      }
      if (signal.aborted) return;
      setHistory(recentHistory);
      const mixed = buildRecommendationFeed({
        history: recentHistory,
        candidates,
        topics,
        feedback,
        impressions,
        tuning,
        seed: refreshKey + Date.now(),
        limit: 60,
      });
      if (mixed.length > 0) {
        if (accountId) {
          void fetch('/api/v1/youtube/recommendations/impressions', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoIds: mixed.map(video => video.videoId) }),
          }).catch(() => undefined);
        } else {
          const nextImpressions = { ...impressions };
          for (const video of mixed) nextImpressions[video.videoId] = (nextImpressions[video.videoId] ?? 0) + 1;
          saveGuestRecommendationState({ impressions: nextImpressions });
        }
      }
      const bucketRows: Array<{ key: string; label: string; requested: number }> = [
        { key: 'subscriptions', label: 'Recent channel uploads', requested: tuning.shares.subscriptions },
        { key: 'similar', label: 'Similar videos', requested: tuning.shares.similar },
        { key: 'new', label: 'New channels', requested: tuning.shares.new },
        { key: 'throwback', label: 'Throwbacks', requested: tuning.shares.throwback },
        { key: 'rewatch', label: 'Rewatches', requested: tuning.shares.rewatch },
        { key: 'interest', label: 'Your interests', requested: Math.min(35, topics.filter(topic => topic.kind === 'interest').reduce((sum, topic) => sum + (topic.share ?? 0), 0)) },
      ];
      setMixSummary(bucketRows.map(row => {
        const count = mixed.filter(video => video.recommendationBucket === row.key).length;
        return { ...row, count, actual: mixed.length ? Math.round(count / mixed.length * 100) : 0 };
      }));
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

  const applyFeedback = useCallback(async (
    video: YouTubeCardVideo,
    action: 'not_interested' | 'dont_recommend_channel',
  ) => {
    try {
      const targetId = action === 'not_interested' ? video.videoId : (video.channelId ?? '');
      if (accountId) {
        const targetType = action === 'not_interested' ? 'video' : 'channel';
        const response = await fetch('/api/v1/youtube/recommendations/feedback', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetType, targetId, action }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error?.message ?? 'Recommendation feedback could not be saved.');
        }
      } else {
        const current = readGuestRecommendationState();
        const field = action === 'not_interested' ? 'notInterestedVideoIds' : 'blockedChannelIds';
        const values = new Set(current.feedback[field]);
        values.add(targetId);
        saveGuestRecommendationState({ feedback: { ...current.feedback, [field]: [...values] } });
      }
      setVideos(current => current.filter(item =>
        action === 'not_interested'
          ? item.videoId !== video.videoId
          : item.channelId !== video.channelId,
      ));
    } catch (caught) {
      setError({ message: caught instanceof Error ? caught.message : 'Recommendation feedback could not be saved.' });
    }
  }, [accountId]);

  const shorts = useMemo(() => videos.filter(isShort).slice(0, 5), [videos]);
  const regularVideos = useMemo(() => videos.filter(video => !isShort(video)), [videos]);
  const suggestedChannels = useMemo(() => {
    const channels = new Map<string, DiscoveryVideo[]>();
    for (const video of videos) {
      if (video.recommendationBucket !== 'new' || !video.channelId) continue;
      const current = channels.get(video.channelId) ?? [];
      current.push(video);
      channels.set(video.channelId, current);
    }
    return [...channels.entries()].map(([channelId, channelVideos]) => ({
      channelId,
      channelTitle: channelVideos[0].channelTitle,
      sample: channelVideos[0],
      videoCount: channelVideos.length,
    })).slice(0, 6);
  }, [videos]);
  const firstRowVideos = regularVideos.slice(0, 8);
  const remainingVideos = regularVideos.slice(8);

  return (
    <section className="yt-page yt-home-page yt-home-redesign">
      {!loading && (
        <div className="yt-feed-toolbar" aria-label="Recommendation controls">
          <Link to="/youtube/recommendations" className="yt-feed-algorithm-link">Algorithm</Link>
          <button type="button" onClick={() => setRefreshKey(value => value + 1)}>Refresh feed</button>
        </div>
      )}
      {!loading && !error && mixSummary.some(row => row.count > 0) && (
        <div className="yt-feed-mix" aria-label="Actual recommendation mix">
          <span className="yt-feed-mix-title">Feed mix</span>
          {mixSummary.filter(row => row.count > 0).map(row => (
            <span key={row.key}><b>{row.actual}%</b> {row.label} <small>target {row.requested}%</small></span>
          ))}
        </div>
      )}
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

      {!loading && !error && firstRowVideos.length > 0 && (
        <section className="yt-feed-section">
          <div className="yt-video-grid yt-feed-grid">
            {firstRowVideos.map(video => (
              <YouTubeVideoCard
                key={video.videoId}
                video={video}
                relatedVideos={videos}
                onNotInterested={item => void applyFeedback(item, 'not_interested')}
                onBlockChannel={item => void applyFeedback(item, 'dont_recommend_channel')}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && suggestedChannels.length > 0 && (
        <section className="yt-channel-suggestions" aria-label="Channels you might like">
          <div className="yt-section-heading"><h2>Channels you might like</h2></div>
          <div className="yt-channel-suggestions-row">
            {suggestedChannels.map(channel => (
              <Link
                key={channel.channelId}
                to={'/youtube/watch/' + channel.sample.videoId}
                state={{ youtubeRelatedVideos: videos, youtubeCurrentVideo: channel.sample }}
                className="yt-channel-suggestion"
              >
                <span className="yt-channel-suggestion-avatar">
                  {channel.sample.channelAvatarUrl
                    ? <img src={channel.sample.channelAvatarUrl} alt="" loading="lazy" />
                    : (channel.channelTitle.trim().slice(0, 1).toUpperCase() || 'Y')}
                </span>
                <b>{channel.channelTitle}</b>
                <small>{channel.videoCount} recommended {channel.videoCount === 1 ? 'video' : 'videos'}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && remainingVideos.length > 0 && (
        <section className="yt-feed-section">
          <div className="yt-video-grid yt-feed-grid">
            {remainingVideos.map(video => (
              <YouTubeVideoCard
                key={video.videoId}
                video={video}
                relatedVideos={videos}
                onNotInterested={item => void applyFeedback(item, 'not_interested')}
                onBlockChannel={item => void applyFeedback(item, 'dont_recommend_channel')}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
