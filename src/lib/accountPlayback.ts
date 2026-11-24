import {
  flushPendingMediaPlayback,
  loadMediaPlayback,
  syncMediaPlayback,
  type MediaPlaybackSnapshot,
  type MediaPlaybackType,
} from './mediaPlayback';

/**
 * Closed-site playback bridge. Callers must pass the authenticated profile
 * returned by /api/v1/me; there is deliberately no guest/null account path.
 */
export function createAccountPlayback(user: { id: string }) {
  const accountId = user.id;
  if (!accountId || !accountId.trim()) throw new Error('An authenticated Kairo account ID is required.');

  return {
    load(mediaType: MediaPlaybackType, mediaKey: string) {
      return loadMediaPlayback(accountId, mediaType, mediaKey);
    },
    save(snapshot: MediaPlaybackSnapshot, keepalive = false) {
      return syncMediaPlayback(accountId, snapshot, keepalive);
    },
    flush() {
      return flushPendingMediaPlayback(accountId);
    },
  };
}
