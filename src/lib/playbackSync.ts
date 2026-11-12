export type PlaybackSaveReason = 'play' | 'pause' | 'seeked' | 'ended' | 'pagehide' | 'timeupdate';

export const PLAYBACK_SERVER_SYNC_INTERVAL_MS = 15_000;

/**
 * timeupdate can fire many times per second. Only allow periodic background
 * syncs every 15s; user-intent/lifecycle events can flush a changed position
 * immediately.
 */
export function shouldSyncPlaybackProgress(
  reason: PlaybackSaveReason,
  lastSyncedAt: number,
  lastSyncedSeconds: number,
  currentSeconds: number,
  now: number,
): boolean {
  if (!Number.isFinite(currentSeconds) || currentSeconds < 0) return false;
  if (reason === 'timeupdate') return now - lastSyncedAt >= PLAYBACK_SERVER_SYNC_INTERVAL_MS;
  return Math.abs(currentSeconds - lastSyncedSeconds) >= 1 ||
    now - lastSyncedAt >= PLAYBACK_SERVER_SYNC_INTERVAL_MS;
}
