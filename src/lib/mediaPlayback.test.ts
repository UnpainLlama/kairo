import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteMediaPlayback,
  flushPendingMediaPlayback,
  listLocalMediaPlayback,
  mediaPlaybackStorageKey,
  normalizePlayerState,
  parseMediaPlayback,
  readLocalMediaPlayback,
  syncMediaPlayback,
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

  it('keeps failed cloud checkpoints in a durable queue and retries them with backoff', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await syncMediaPlayback('user-a', snapshot())).toBe(false);
    const queueKey = 'kairo-media-playback:v1:user-a:pending-sync';
    const queued = JSON.parse(localStorage.getItem(queueKey) ?? '[]');
    expect(queued).toHaveLength(1);
    expect(queued[0].attempts).toBe(1);
    expect(queued[0].nextAttemptAt).toBeGreaterThan(Date.now());

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(firstBody.syncSessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(firstBody.syncSequence).toBe(1);

    await flushPendingMediaPlayback('user-a', Number.MAX_SAFE_INTEGER);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(retryBody.syncSessionId).toBe(firstBody.syncSessionId);
    expect(retryBody.syncSequence).toBe(firstBody.syncSequence);
    expect(localStorage.getItem(queueKey)).toBeNull();
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

  it('deletes signed-in movie playback from the account API as well as local storage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { removed: true, changes: 1 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    writeLocalMediaPlayback('user-a', snapshot());

    expect(await deleteMediaPlayback('user-a', 'movie', '550')).toBe(true);
    expect(readLocalMediaPlayback('user-a', 'movie', '550')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/me/playback?mediaType=movie&mediaKey=550');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'DELETE',
      credentials: 'same-origin',
    });
  });
});
