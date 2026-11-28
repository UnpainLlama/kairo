import { readBrowserJson, writeBrowserJson, dispatchBrowserChange } from './browserPersistence';

export type YouTubeLocalVideo = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  progressSeconds?: number;
  completed?: boolean;
  viewCount?: number;
  firstViewedAt?: number;
  lastViewedAt?: number;
  updatedAt: number;
  savedAt?: number;
};

const HISTORY_KEY = 'kairo-youtube-history:v1:guest';
const WATCH_LATER_KEY = 'kairo-youtube-watch-later:v1:guest';
export const YOUTUBE_LOCAL_CHANGE = 'kairo:youtube-local-library-change';

function isLocalVideo(value: unknown): value is YouTubeLocalVideo {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(item.videoId)
    && typeof item.title === 'string' && typeof item.description === 'string'
    && (item.thumbnailUrl === null || typeof item.thumbnailUrl === 'string')
    && typeof item.channelTitle === 'string'
    && (item.publishedAt === null || typeof item.publishedAt === 'string')
    && (item.durationSeconds === null || typeof item.durationSeconds === 'number')
    && typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
    && (item.viewCount === undefined || (typeof item.viewCount === 'number' && Number.isFinite(item.viewCount) && item.viewCount >= 0))
    && (item.firstViewedAt === undefined || (typeof item.firstViewedAt === 'number' && Number.isFinite(item.firstViewedAt)))
    && (item.lastViewedAt === undefined || (typeof item.lastViewedAt === 'number' && Number.isFinite(item.lastViewedAt)));
}

function readList(key: string): YouTubeLocalVideo[] {
  const value = readBrowserJson<unknown>(key, []);
  if (!Array.isArray(value)) return [];
  return value.filter(isLocalVideo).slice(0, 200);
}

function writeList(key: string, items: YouTubeLocalVideo[]): void {
  writeBrowserJson(key, items.slice(0, 200));
  dispatchBrowserChange(YOUTUBE_LOCAL_CHANGE);
}


export type GuestRecommendationTopic = {
  id: string;
  topic: string;
  kind: 'interest' | 'block';
  share: number;
  expiresAt: number | null;
};

export type GuestRecommendationState = {
  active: string;
  tuning: Record<string, unknown>;
  topics: GuestRecommendationTopic[];
  feedback: {
    notInterestedVideoIds: string[];
    blockedChannelIds: string[];
    dismissedChannelIds: string[];
  };
  impressions: Record<string, number>;
};

const RECOMMENDATION_KEY = 'kairo.youtube.recommendations.v1';

const EMPTY_RECOMMENDATION_STATE: GuestRecommendationState = {
  active: 'balanced',
  tuning: {},
  topics: [],
  feedback: {
    notInterestedVideoIds: [],
    blockedChannelIds: [],
    dismissedChannelIds: [],
  },
  impressions: {},
};

export function readGuestRecommendationState(): GuestRecommendationState {
  if (typeof localStorage === 'undefined') return EMPTY_RECOMMENDATION_STATE;
  try {
    const raw = localStorage.getItem(RECOMMENDATION_KEY);
    if (!raw) return EMPTY_RECOMMENDATION_STATE;
    const value = JSON.parse(raw) as Partial<GuestRecommendationState>;
    const feedback = value.feedback ?? EMPTY_RECOMMENDATION_STATE.feedback;
    const impressions: Record<string, number> = {};
    if (value.impressions && typeof value.impressions === 'object') {
      for (const [id, count] of Object.entries(value.impressions)) {
        if (typeof count === 'number' && Number.isFinite(count) && count >= 0) impressions[id] = count;
      }
    }
    return {
      active: typeof value.active === 'string' ? value.active : 'balanced',
      tuning: value.tuning && typeof value.tuning === 'object' && !Array.isArray(value.tuning) ? value.tuning : {},
      topics: Array.isArray(value.topics) ? value.topics.filter((item): item is GuestRecommendationTopic =>
        Boolean(item && typeof item.id === 'string' && typeof item.topic === 'string' &&
          (item.kind === 'interest' || item.kind === 'block') && typeof item.share === 'number')
      ) : [],
      feedback: {
        notInterestedVideoIds: Array.isArray(feedback.notInterestedVideoIds) ? feedback.notInterestedVideoIds.filter((id): id is string => typeof id === 'string') : [],
        blockedChannelIds: Array.isArray(feedback.blockedChannelIds) ? feedback.blockedChannelIds.filter((id): id is string => typeof id === 'string') : [],
        dismissedChannelIds: Array.isArray(feedback.dismissedChannelIds) ? feedback.dismissedChannelIds.filter((id): id is string => typeof id === 'string') : [],
      },
      impressions,
    };
  } catch {
    return EMPTY_RECOMMENDATION_STATE;
  }
}

export function saveGuestRecommendationState(
  patch: Partial<GuestRecommendationState>,
): GuestRecommendationState {
  const current = readGuestRecommendationState();
  const next: GuestRecommendationState = {
    ...current,
    ...patch,
    feedback: { ...current.feedback, ...(patch.feedback ?? {}) },
    tuning: patch.tuning ?? current.tuning,
    topics: patch.topics ?? current.topics,
    impressions: patch.impressions ?? current.impressions,
  };
  try {
    localStorage.setItem(RECOMMENDATION_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full storage quota should not interrupt browsing.
  }
  return next;
}

export function readGuestYouTubeHistory(): YouTubeLocalVideo[] {
  return readList(HISTORY_KEY).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function readGuestYouTubeWatchLater(): YouTubeLocalVideo[] {
  return readList(WATCH_LATER_KEY).sort((a, b) => (b.savedAt ?? b.updatedAt) - (a.savedAt ?? a.updatedAt));
}

export function recordGuestYouTubeView(video: Omit<YouTubeLocalVideo, 'updatedAt' | 'savedAt' | 'progressSeconds' | 'completed'>): void {
  const current = readList(HISTORY_KEY);
  const previous = current.find((item) => item.videoId === video.videoId);
  const now = Date.now();
  const next: YouTubeLocalVideo = {
    ...video,
    progressSeconds: previous?.progressSeconds ?? 0,
    completed: previous?.completed ?? false,
    viewCount: (previous?.viewCount ?? 0) + 1,
    firstViewedAt: previous?.firstViewedAt ?? now,
    lastViewedAt: now,
    updatedAt: now,
  };
  writeList(HISTORY_KEY, [next, ...current.filter((item) => item.videoId !== video.videoId)]);
}

export function saveGuestYouTubeProgress(video: Omit<YouTubeLocalVideo, 'updatedAt' | 'savedAt'>): void {
  const current = readList(HISTORY_KEY);
  const previous = current.find((item) => item.videoId === video.videoId);
  const now = Date.now();
  const next: YouTubeLocalVideo = {
    ...video,
    viewCount: video.viewCount ?? previous?.viewCount,
    firstViewedAt: video.firstViewedAt ?? previous?.firstViewedAt,
    lastViewedAt: video.lastViewedAt ?? previous?.lastViewedAt,
    updatedAt: now,
  };
  writeList(HISTORY_KEY, [next, ...current.filter((item) => item.videoId !== video.videoId)]);
}

export function addGuestYouTubeWatchLater(video: Omit<YouTubeLocalVideo, 'updatedAt' | 'savedAt'>): void {
  const current = readList(WATCH_LATER_KEY);
  const previous = current.find((item) => item.videoId === video.videoId);
  const now = Date.now();
  writeList(WATCH_LATER_KEY, [
    { ...video, updatedAt: now, savedAt: previous?.savedAt ?? now },
    ...current.filter((item) => item.videoId !== video.videoId),
  ]);
}

export function removeGuestYouTubeHistory(videoId: string): void {
  writeList(HISTORY_KEY, readList(HISTORY_KEY).filter((item) => item.videoId !== videoId));
}

export function removeGuestYouTubeWatchLater(videoId: string): void {
  writeList(WATCH_LATER_KEY, readList(WATCH_LATER_KEY).filter((item) => item.videoId !== videoId));
}
