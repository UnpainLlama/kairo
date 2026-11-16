import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteMediaPlayback,
  listLocalMediaPlayback,
  mediaPlaybackStorageKey,
  normalizePlayerState,
  parseMediaPlayback,
  readLocalMediaPlayback,
  writeLocalMediaPlayback,
  type MediaPlaybackSnapshot,
} from './mediaPlayback';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const snapshot = (overrides: Partial<MediaPlaybackSnapshot> = {}): MediaPlaybackSnapshot => ({
  mediaType: 'movie',
  mediaKey: '550',
  title: 'Fight Club',
  artworkUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  progressSeconds: 128,
  durationSeconds: 7200,
  completed: false,
  playerState: { volume: 0.6, muted: false, playbackRate: 1.25, sourceId: 'server_1' },
  updatedAt: 1000,
  ...overrides,
});

describe('shared media playback persistence', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('isolates the same media item by account and media type', () => {
    expect(mediaPlaybackStorageKey('user-a', 'movie', '550')).not.toBe(mediaPlaybackStorageKey('user-b', 'movie', '550'));
    expect(mediaPlaybackStorageKey('user-a', 'movie', '550')).not.toBe(mediaPlaybackStorageKey('user-a', 'anime', '550'));
    expect(mediaPlaybackStorageKey(null, 'movie', '550')).toContain(':guest:');
  });

  it('normalizes and bounds player controls', () => {
    expect(normalizePlayerState({ volume: 4, muted: true, playbackRate: 9, sourceId: '../unsafe', quality: '1080' }))
      .toEqual({ volume: 1, muted: true, playbackRate: 2, quality: '1080' });
  });

  it('validates playback records and rejects invalid positions or identities', () => {
    expect(parseMediaPlayback(snapshot())).toMatchObject({ mediaType: 'movie', mediaKey: '550', progressSeconds: 128 });
    expect(parseMediaPlayback({ ...snapshot(), progressSeconds: -10 })).toBeNull();
    expect(parseMediaPlayback({ ...snapshot(), mediaType: 'untrusted' })).toBeNull();
    expect(parseMediaPlayback({ ...snapshot(), mediaKey: '' })).toBeNull();
  });

  it('stores and lists local playback per guest or account scope', () => {
    writeLocalMediaPlayback('user-a', snapshot());
    writeLocalMediaPlayback('user-a', snapshot({ mediaType: 'youtube', mediaKey: 'abcdefghijk', updatedAt: 2000 }));
    writeLocalMediaPlayback('user-b', snapshot({ progressSeconds: 999 }));
    expect(readLocalMediaPlayback('user-a', 'movie', '550')?.progressSeconds).toBe(128);
    expect(listLocalMediaPlayback('user-a').map(item => item.mediaType)).toEqual(['youtube', 'movie']);
    expect(listLocalMediaPlayback('user-b')).toHaveLength(1);
  });

  it('deletes one local resume record or clears a whole media namespace', async () => {
    writeLocalMediaPlayback(null, snapshot());
    writeLocalMediaPlayback(null, snapshot({ mediaKey: '603' }));
    writeLocalMediaPlayback(null, snapshot({ mediaType: 'youtube', mediaKey: 'abcdefghijk' }));
    expect(await deleteMediaPlayback(null, 'movie', '550')).toBe(true);
    expect(readLocalMediaPlayback(null, 'movie', '550')).toBeNull();
    expect(listLocalMediaPlayback(null)).toHaveLength(2);
    expect(await deleteMediaPlayback(null, 'movie')).toBe(true);
    expect(listLocalMediaPlayback(null).map(item => item.mediaType)).toEqual(['youtube']);
  });
});
