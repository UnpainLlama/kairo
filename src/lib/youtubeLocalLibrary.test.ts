import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addGuestYouTubeWatchLater, readGuestRecommendationState, readGuestYouTubeHistory, readGuestYouTubeWatchLater,
  recordGuestYouTubeView, removeGuestYouTubeHistory, removeGuestYouTubeWatchLater, saveGuestRecommendationState, saveGuestYouTubeProgress,
} from './youtubeLocalLibrary';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const video = {
  videoId: 'abcdefghijk',
  title: 'Example video',
  description: 'Description',
  thumbnailUrl: null,
  channelId: 'UC1234567890',
  channelTitle: 'Example channel',
  publishedAt: null,
  durationSeconds: 120,
};

describe('guest YouTube browser library', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps playback history in browser storage and updates progress', () => {
    saveGuestYouTubeProgress({ ...video, progressSeconds: 25, completed: false });
    expect(readGuestYouTubeHistory()).toHaveLength(1);
    expect(readGuestYouTubeHistory()[0]).toMatchObject({ videoId: video.videoId, progressSeconds: 25 });
    saveGuestYouTubeProgress({ ...video, progressSeconds: 80, completed: false });
    expect(readGuestYouTubeHistory()).toHaveLength(1);
    expect(readGuestYouTubeHistory()[0].progressSeconds).toBe(80);
  });

  it('records a guest video view and keeps any existing progress intact', () => {
    recordGuestYouTubeView(video);
    expect(readGuestYouTubeHistory()).toHaveLength(1);
    expect(readGuestYouTubeHistory()[0]).toMatchObject({
      videoId: video.videoId,
      progressSeconds: 0,
      completed: false,
      viewCount: 1,
    });
    const firstViewedAt = readGuestYouTubeHistory()[0].firstViewedAt;

    saveGuestYouTubeProgress({ ...video, progressSeconds: 42, completed: false });
    recordGuestYouTubeView({ ...video, title: 'Updated title' });
    expect(readGuestYouTubeHistory()).toHaveLength(1);
    expect(readGuestYouTubeHistory()[0]).toMatchObject({
      title: 'Updated title',
      progressSeconds: 42,
      completed: false,
      viewCount: 2,
      firstViewedAt,
    });
  });

  it('stores and removes Watch Later independently from history', () => {
    addGuestYouTubeWatchLater(video);
    saveGuestYouTubeProgress({ ...video, progressSeconds: 40 });
    expect(readGuestYouTubeWatchLater()).toHaveLength(1);
    expect(readGuestYouTubeHistory()).toHaveLength(1);
    removeGuestYouTubeWatchLater(video.videoId);
    expect(readGuestYouTubeWatchLater()).toEqual([]);
    expect(readGuestYouTubeHistory()).toHaveLength(1);
    removeGuestYouTubeHistory(video.videoId);
    expect(readGuestYouTubeHistory()).toEqual([]);
  });

  it('persists guest recommendation tuning, topics, feedback and impressions', () => {
    saveGuestRecommendationState({
      active: 'explorer',
      tuning: { freshness: 75 },
      topics: [{ id: 'topic-1', topic: 'animation', kind: 'interest', share: 12, expiresAt: null }],
      feedback: { notInterestedVideoIds: ['abcdefghijk'], blockedChannelIds: [], dismissedChannelIds: [] },
      impressions: { abcdefghijk: 3 },
    });

    expect(readGuestRecommendationState()).toMatchObject({
      active: 'explorer',
      tuning: { freshness: 75 },
      topics: [{ id: 'topic-1', topic: 'animation', kind: 'interest', share: 12 }],
      feedback: { notInterestedVideoIds: ['abcdefghijk'] },
      impressions: { abcdefghijk: 3 },
    });
  });

  it('ignores malformed stored entries', () => {
    localStorage.setItem('kairo-youtube-history:v1:guest', JSON.stringify([{ videoId: 'bad', title: 12 }]));
    expect(readGuestYouTubeHistory()).toEqual([]);
  });
});
