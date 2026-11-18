export type PlaybackSaveReason = 'open' | 'play' | 'pause' | 'seeked' | 'ended' | 'pagehide' | 'timeupdate' | 'volumechange' | 'ratechange' | 'subtitlechange' | 'sourcechange' | 'close';

export const PLAYBACK_SERVER_SYNC_INTERVAL_MS = 60_000;

/**
 * timeupdate can fire many times per second. Only allow periodic background
 * syncs every 60s; user-intent/lifecycle events can flush a changed position
 * immediately.
 */
export function shouldSyncPlaybackProgress(
  reason: PlaybackSaveReason,
  lastSyncedAt: number,
  lastSyncedSeconds: number,
  currentSeconds: number,
  now: number,
  stateChanged = false,
): boolean {
  if (!Number.isFinite(currentSeconds) || currentSeconds < 0 || reason === 'open') return false;
  if (reason === 'pagehide' || reason === 'pause' || reason === 'seeked' || reason === 'ended' || reason === 'close' || stateChanged) return true;
  if (reason === 'timeupdate') return now - lastSyncedAt >= PLAYBACK_SERVER_SYNC_INTERVAL_MS;
  return Math.abs(currentSeconds - lastSyncedSeconds) >= 1 ||
    now - lastSyncedAt >= PLAYBACK_SERVER_SYNC_INTERVAL_MS;
}
