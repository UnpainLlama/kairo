import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addGuestYouTubeWatchLater, readGuestYouTubeHistory, readGuestYouTubeWatchLater,
  removeGuestYouTubeHistory, removeGuestYouTubeWatchLater, saveGuestYouTubeProgress,
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

  it('ignores malformed stored entries', () => {
    localStorage.setItem('kairo-youtube-history:v1:guest', JSON.stringify([{ videoId: 'bad', title: 12 }]));
    expect(readGuestYouTubeHistory()).toEqual([]);
  });
});
