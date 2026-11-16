export type MediaPlaybackType = 'anime' | 'movie' | 'youtube';

export type SavedPlayerState = {
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
  quality?: string;
  subtitleLanguage?: string;
  sourceId?: string;
};

export type MediaPlaybackSnapshot = {
  mediaType: MediaPlaybackType;
  mediaKey: string;
  title: string;
  artworkUrl: string | null;
  progressSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  playerState: SavedPlayerState;
  updatedAt: number;
};

const LOCAL_PREFIX = 'kairo-media-playback:v1:';

export function mediaPlaybackStorageKey(userId: string | null, mediaType: MediaPlaybackType, mediaKey: string): string {
  const scope = userId && userId.trim() ? userId.trim() : 'guest';
  return LOCAL_PREFIX + scope + ':' + mediaType + ':' + encodeURIComponent(mediaKey);
}

export function normalizePlayerState(value: unknown): SavedPlayerState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: SavedPlayerState = {};
  if (typeof input.volume === 'number' && Number.isFinite(input.volume)) result.volume = Math.max(0, Math.min(1, input.volume));
  if (typeof input.muted === 'boolean') result.muted = input.muted;
  if (typeof input.playbackRate === 'number' && Number.isFinite(input.playbackRate)) result.playbackRate = Math.max(0.25, Math.min(2, input.playbackRate));
  if (typeof input.quality === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(input.quality)) result.quality = input.quality;
  if (typeof input.subtitleLanguage === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(input.subtitleLanguage)) result.subtitleLanguage = input.subtitleLanguage;
  if (typeof input.sourceId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(input.sourceId)) result.sourceId = input.sourceId;
  return result;
}

export function parseMediaPlayback(value: unknown): MediaPlaybackSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!['anime', 'movie', 'youtube'].includes(String(item.mediaType))) return null;
  if (typeof item.mediaKey !== 'string' || !item.mediaKey.trim() || item.mediaKey.length > 256) return null;
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300) return null;
  const progressSeconds = Number(item.progressSeconds);
  const durationValue = item.durationSeconds === null || item.durationSeconds === undefined ? null : Number(item.durationSeconds);
  const updatedAt = Number(item.updatedAt);
  if (!Number.isFinite(progressSeconds) || progressSeconds < 0 || progressSeconds > 86400) return null;
  if (durationValue !== null && (!Number.isFinite(durationValue) || durationValue <= 0 || durationValue > 86400)) return null;
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  const artwork = typeof item.artworkUrl === 'string' && item.artworkUrl.startsWith('https://') && item.artworkUrl.length <= 2048
    ? item.artworkUrl : null;
  return {
    mediaType: item.mediaType as MediaPlaybackType,
    mediaKey: item.mediaKey,
    title: item.title.trim(),
    artworkUrl: artwork,
    progressSeconds,
    durationSeconds: durationValue,
    completed: item.completed === true,
    playerState: normalizePlayerState(item.playerState),
    updatedAt,
  };
}

export function readLocalMediaPlayback(userId: string | null, mediaType: MediaPlaybackType, mediaKey: string): MediaPlaybackSnapshot | null {
  try {
    const raw = localStorage.getItem(mediaPlaybackStorageKey(userId, mediaType, mediaKey));
    if (!raw) return null;
    const parsed = parseMediaPlayback(JSON.parse(raw));
    return parsed && parsed.mediaType === mediaType && parsed.mediaKey === mediaKey ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalMediaPlayback(userId: string | null, snapshot: MediaPlaybackSnapshot): void {
  try {
    localStorage.setItem(mediaPlaybackStorageKey(userId, snapshot.mediaType, snapshot.mediaKey), JSON.stringify({
      ...snapshot,
      playerState: normalizePlayerState(snapshot.playerState),
    }));
  } catch {
    // Local persistence can be unavailable or full; playback itself must keep working.
  }
}

export async function syncMediaPlayback(
  userId: string | null,
  snapshot: MediaPlaybackSnapshot,
  keepalive = false,
): Promise<boolean> {
  writeLocalMediaPlayback(userId, snapshot);
  if (!userId) return true;
  try {
    const response = await fetch('/api/v1/me/playback', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
      keepalive,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Local-first restore. A newer browser snapshot wins; the selected copy is cached locally. */
export async function loadMediaPlayback(
  userId: string | null,
  mediaType: MediaPlaybackType,
  mediaKey: string,
): Promise<MediaPlaybackSnapshot | null> {
  const local = readLocalMediaPlayback(userId, mediaType, mediaKey);
  if (!userId) return local;
  try {
    const query = new URLSearchParams({ mediaType, mediaKey });
    const response = await fetch('/api/v1/me/playback?' + query.toString(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const payload = response.ok ? await response.json() : null;
    if (!response.ok || !payload?.success) return local;
    const remote = parseMediaPlayback(payload.data?.item);
    const selected = local && (!remote || local.updatedAt > remote.updatedAt) ? local : remote ?? local;
    if (!selected) return null;
    writeLocalMediaPlayback(userId, selected);
    if (local && (!remote || local.updatedAt > remote.updatedAt)) void syncMediaPlayback(userId, local);
    return selected;
  } catch {
    return local;
  }
}

export function listLocalMediaPlayback(userId: string | null): MediaPlaybackSnapshot[] {
  const scope = userId && userId.trim() ? userId.trim() : 'guest';
  const prefix = LOCAL_PREFIX + scope + ':';
  const items: MediaPlaybackSnapshot[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const parsed = parseMediaPlayback(JSON.parse(localStorage.getItem(key) ?? 'null'));
      if (parsed) items.push(parsed);
    }
  } catch {
    // Return the records already read if a browser storage operation fails.
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteMediaPlayback(
  userId: string | null,
  mediaType: MediaPlaybackType,
  mediaKey?: string,
): Promise<boolean> {
  const scope = userId && userId.trim() ? userId.trim() : 'guest';
  const prefix = LOCAL_PREFIX + scope + ':' + mediaType + ':';
  try {
    if (mediaKey) localStorage.removeItem(mediaPlaybackStorageKey(userId, mediaType, mediaKey));
    else {
      const remove: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) remove.push(key);
      }
      remove.forEach(key => localStorage.removeItem(key));
    }
  } catch { /* local storage may be unavailable */ }
  if (!userId) return true;
  try {
    const query = new URLSearchParams({ mediaType });
    if (mediaKey) query.set('mediaKey', mediaKey);
    const response = await fetch('/api/v1/me/playback?' + query.toString(), {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}
