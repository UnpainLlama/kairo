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
    && typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt);
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

export function readGuestYouTubeHistory(): YouTubeLocalVideo[] {
  return readList(HISTORY_KEY).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function readGuestYouTubeWatchLater(): YouTubeLocalVideo[] {
  return readList(WATCH_LATER_KEY).sort((a, b) => (b.savedAt ?? b.updatedAt) - (a.savedAt ?? a.updatedAt));
}

export function saveGuestYouTubeProgress(video: Omit<YouTubeLocalVideo, 'updatedAt' | 'savedAt'>): void {
  const current = readList(HISTORY_KEY);
  const now = Date.now();
  const next: YouTubeLocalVideo = { ...video, updatedAt: now };
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
