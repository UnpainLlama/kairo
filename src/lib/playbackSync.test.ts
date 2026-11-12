import { describe, expect, it } from 'vitest';
import { PLAYBACK_SERVER_SYNC_INTERVAL_MS, shouldSyncPlaybackProgress } from './playbackSync';

describe('playback progress sync policy', () => {
  it('does not send a request for every timeupdate event', () => {
    expect(shouldSyncPlaybackProgress('timeupdate', 10_000, 30, 31, 20_000)).toBe(false);
    expect(shouldSyncPlaybackProgress('timeupdate', 10_000, 30, 45, 24_999)).toBe(false);
  });

  it('syncs during playback at the 15-second interval', () => {
    expect(shouldSyncPlaybackProgress('timeupdate', 10_000, 30, 45, 25_000)).toBe(true);
    expect(PLAYBACK_SERVER_SYNC_INTERVAL_MS).toBe(15_000);
  });

  it('flushes changed positions on play, pause, seek, end and page exit', () => {
    for (const reason of ['play', 'pause', 'seeked', 'ended', 'pagehide'] as const) {
      expect(shouldSyncPlaybackProgress(reason, 10_000, 30, 35, 10_100)).toBe(true);
    }
  });

  it('does not resend unchanged event positions unnecessarily', () => {
    expect(shouldSyncPlaybackProgress('pause', 10_000, 35, 35, 10_100)).toBe(false);
  });

  it('rejects negative and non-finite positions', () => {
    expect(shouldSyncPlaybackProgress('pause', 0, 0, -1, 100)).toBe(false);
    expect(shouldSyncPlaybackProgress('pause', 0, 0, Number.NaN, 100)).toBe(false);
  });
});
