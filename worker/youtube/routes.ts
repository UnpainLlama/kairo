import { findSessionUser } from '../auth/session';

type YouTubeBindings = { DB: D1Database; YOUTUBE_DATA_API_KEY?: string };
type YouTubeContext = {
  env: YouTubeBindings;
  req: {
    url: string;
    header(name: string): string | undefined;
    param(name: string): string;
    json(): Promise<unknown>;
  };
  json(body: unknown, status?: number): Response;
  header(name: string, value: string): void;
  executionCtx?: { waitUntil(promise: Promise<unknown>): void };
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^[A-Za-z0-9_-]{6,64}$/;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAILY_API_LIMIT = 8000;

export type YouTubeVideoRecord = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  channelAvatarUrl?: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  /** null means YouTube did not return this field; it is not the same as an explicit false. */
  embeddable: boolean | null;
  madeForKids: boolean;
  url: string;
};

export function isYouTubeVideoEmbeddable(status: unknown): boolean | null {
  if (!status || typeof status !== 'object' || Array.isArray(status)) return null;
  const value = (status as Record<string, unknown>).embeddable;
  return typeof value === 'boolean' ? value : null;
}

export function isYouTubeVideoMarkedMadeForKids(status: unknown): boolean {
  if (!status || typeof status !== 'object') return false;
  return (status as Record<string, unknown>).madeForKids === true;
}

export function isYouTubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

export function parseYouTubeDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total >= 0 && total <= 604800 ? Math.floor(total) : null;
}

export function safeYouTubeThumbnailUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = host === 'i.ytimg.com' || host === 'yt3.ggpht.com' || host.endsWith('.ytimg.com') || host.endsWith('.ggpht.com');
    if (url.protocol !== 'https:' || !allowed || url.username || url.password || url.port) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function youtubeChannelAvatarUrl(thumbnails: unknown): string | null {
  if (!thumbnails || typeof thumbnails !== 'object') return null;
  const variants = thumbnails as Record<string, { url?: unknown } | undefined>;
  for (const size of ['maxres', 'high', 'medium', 'default']) {
    const candidate = safeYouTubeThumbnailUrl(variants[size]?.url);
    if (candidate) return candidate;
  }
  return null;
}

async function shaHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function bumpRateBucket(c: YouTubeContext, bucket: string, limit: number, windowMs: number, cost = 1): Promise<boolean> {
  const bucketKey = await shaHex('youtube:quota:' + bucket);
  const now = Date.now();
  const row = await c.env.DB.prepare(
    'INSERT INTO auth_rate_limits (bucket_key,window_started_at,attempts) VALUES (?,?,?) ' +
    'ON CONFLICT(bucket_key) DO UPDATE SET ' +
    'attempts=CASE WHEN window_started_at<=? THEN ? ELSE attempts+? END, ' +
    'window_started_at=CASE WHEN window_started_at<=? THEN ? ELSE window_started_at END RETURNING attempts'
  ).bind(bucketKey, now, cost, now - windowMs, cost, cost, now - windowMs, now).first<{ attempts: number }>();
  return Number(row?.attempts ?? limit + 1) <= limit;
}

async function permitRequest(c: YouTubeContext, action: string, identity: string, limit: number): Promise<boolean> {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  return bumpRateBucket(c, action + ':' + ip + ':' + identity, limit, RATE_WINDOW_MS);
}

function noStore(c: YouTubeContext): void {
  c.header('Cache-Control', 'no-store');
}

function fail(c: YouTubeContext, status: number, code: string, message: string): Response {
  return c.json({ success: false, error: { code: code, message: message } }, status);
}

function originAllowed(c: YouTubeContext): boolean {
  const origin = c.req.header('Origin');
  return Boolean(origin) && origin === new URL(c.req.url).origin;
}

async function signedInUser(c: YouTubeContext) {
  return findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
}

function cleanText(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function parseVideoPayload(raw: unknown): Omit<YouTubeVideoRecord, 'embeddable' | 'url' | 'madeForKids'> & { progressSeconds: number; completed: boolean } | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!isYouTubeVideoId(value.videoId)) return null;
  const title = cleanText(value.title, 300);
  if (!title) return null;
  const duration = value.durationSeconds === null || value.durationSeconds === undefined ? null : Number(value.durationSeconds);
  if (duration !== null && (!Number.isFinite(duration) || duration < 0 || duration > 604800)) return null;
  const progress = Number(value.progressSeconds ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 604800) return null;
  const channelId = cleanText(value.channelId, 64);
  if (channelId && !CHANNEL_ID.test(channelId)) return null;
  const publishedAt = typeof value.publishedAt === 'string' && !Number.isNaN(Date.parse(value.publishedAt))
    ? new Date(value.publishedAt).toISOString()
    : null;
  return {
    videoId: value.videoId,
    title: title,
    description: cleanText(value.description, 5000),
    thumbnailUrl: safeYouTubeThumbnailUrl(value.thumbnailUrl),
    channelId: channelId,
    channelTitle: cleanText(value.channelTitle, 180, 'YouTube'),
    publishedAt: publishedAt,
    durationSeconds: duration === null ? null : Math.floor(duration),
    progressSeconds: duration && duration > 0 ? Math.min(progress, duration) : progress,
    completed: value.completed === true,
  };
}

async function youtubeApiChannelAvatar(c: YouTubeContext, apiKey: string, channelId: string): Promise<string | null> {
  if (!CHANNEL_ID.test(channelId)) return null;
  if (!await bumpRateBucket(c, 'data-api-daily', DAILY_API_LIMIT, DAILY_WINDOW_MS, 1)) return null;
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.search = new URLSearchParams({ part: 'snippet', id: channelId, key: apiKey }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as any;
    if (!response.ok) return null;
    const channel = payload?.items?.[0];
    return channel?.id === channelId ? youtubeChannelAvatarUrl(channel.snippet?.thumbnails) : null;
  } catch {
    // Channel art is optional metadata; a transient avatar failure must not block playback.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function youtubeApiVideo(c: YouTubeContext, videoId: string): Promise<YouTubeVideoRecord | null> {
  const apiKey = c.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY_MISSING');
  if (!await bumpRateBucket(c, 'data-api-daily', DAILY_API_LIMIT, DAILY_WINDOW_MS, 1)) throw new Error('YOUTUBE_QUOTA_BUDGET_REACHED');

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.search = new URLSearchParams({ part: 'snippet,contentDetails,status', id: videoId, key: apiKey }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response: Response;
  let payload: any;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    payload = await response.json().catch(() => ({})) as any;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const reason = payload?.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YOUTUBE_QUOTA_EXCEEDED');
    if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || reason === 'ipRefererBlocked') throw new Error('YOUTUBE_API_KEY_INVALID');
    throw new Error('YOUTUBE_PROVIDER_UNAVAILABLE');
  }
  const item = payload?.items?.[0];
  if (!item || item.id !== videoId) return null;
  const snippet = item.snippet ?? {};
  const channelId = cleanText(snippet.channelId, 64);
  const channelAvatarUrl = channelId ? await youtubeApiChannelAvatar(c, apiKey, channelId) : null;
  return {
    videoId: videoId,
    title: cleanText(snippet.title, 300, 'Untitled video'),
    description: cleanText(snippet.description, 5000),
    thumbnailUrl: safeYouTubeThumbnailUrl(snippet.thumbnails?.maxres?.url ?? snippet.thumbnails?.standard?.url ?? snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url),
    channelId: channelId,
    channelTitle: cleanText(snippet.channelTitle, 180, 'YouTube'),
    channelAvatarUrl: channelAvatarUrl,
    publishedAt: typeof snippet.publishedAt === 'string' && !Number.isNaN(Date.parse(snippet.publishedAt)) ? new Date(snippet.publishedAt).toISOString() : null,
    durationSeconds: parseYouTubeDuration(item.contentDetails?.duration),
    embeddable: isYouTubeVideoEmbeddable(item.status),
    madeForKids: isYouTubeVideoMarkedMadeForKids(item.status),
    url: 'https://www.youtube.com/watch?v=' + videoId,
  };
}

function providerError(c: YouTubeContext, error: unknown): Response {
  const code = error instanceof Error ? error.message : '';
  if (code === 'YOUTUBE_API_KEY_MISSING') return fail(c, 503, code, 'YouTube video details are not configured in this environment.');
  if (code === 'YOUTUBE_API_KEY_INVALID') return fail(c, 503, code, 'The YouTube API key is not accepted by Google.');
  if (code === 'YOUTUBE_QUOTA_EXCEEDED' || code === 'YOUTUBE_QUOTA_BUDGET_REACHED') return fail(c, 503, 'YOUTUBE_QUOTA_EXCEEDED', 'YouTube data is temporarily unavailable because the API quota is exhausted.');
  return fail(c, 503, 'YOUTUBE_PROVIDER_UNAVAILABLE', 'YouTube could not complete that request. Please try again.');
}

async function parseJsonBody(c: YouTubeContext): Promise<unknown | null> {
  const length = Number(c.req.header('Content-Length') ?? 0);
  if (Number.isFinite(length) && length > 12000) return null;
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}


function youtubePublishedAfter(filter: string): string | null {
  const days: Record<string, number> = { today: 1, week: 7, month: 30, year: 365 };
  const value = days[filter];
  return value ? new Date(Date.now() - value * 86400000).toISOString() : null;
}

function searchThumbnail(snippet: any): string | null {
  const thumbs = snippet?.thumbnails ?? {};
  return safeYouTubeThumbnailUrl(
    thumbs.maxres?.url ?? thumbs.standard?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url
  );
}

async function youtubeApiVideoDetails(c: YouTubeContext, ids: string[]): Promise<Map<string, { duration: number | null; embeddable: boolean | null; madeForKids: boolean }>> {
  const result = new Map<string, { duration: number | null; embeddable: boolean | null; madeForKids: boolean }>();
  if (ids.length === 0) return result;
  const apiKey = c.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY_MISSING');
  if (!await bumpRateBucket(c, 'data-api-daily', DAILY_API_LIMIT, DAILY_WINDOW_MS, 1)) {
    throw new Error('YOUTUBE_QUOTA_BUDGET_REACHED');
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.search = new URLSearchParams({ part: 'contentDetails,status', id: ids.join(','), key: apiKey }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YOUTUBE_QUOTA_EXCEEDED');
      if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || reason === 'ipRefererBlocked') throw new Error('YOUTUBE_API_KEY_INVALID');
      throw new Error('YOUTUBE_PROVIDER_UNAVAILABLE');
    }
    for (const item of Array.isArray(payload?.items) ? payload.items : []) {
      if (typeof item?.id !== 'string') continue;
      result.set(item.id, {
        duration: parseYouTubeDuration(item.contentDetails?.duration),
        embeddable: isYouTubeVideoEmbeddable(item.status),
        madeForKids: isYouTubeVideoMarkedMadeForKids(item.status),
      });
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function youtubeApiSearchVideos(
  c: YouTubeContext,
  query: string,
  options: { order: string; duration: string; uploadDate: string; eventType: string; pageToken: string | null }
): Promise<{ videos: YouTubeVideoRecord[]; nextPageToken: string | null }> {
  const apiKey = c.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY_MISSING');
  if (!await bumpRateBucket(c, 'data-api-daily', DAILY_API_LIMIT, DAILY_WINDOW_MS, 100)) {
    throw new Error('YOUTUBE_QUOTA_BUDGET_REACHED');
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: '24',
    order: options.order,
    key: apiKey,
  });
  if (options.duration !== 'any') params.set('videoDuration', options.duration);
  const publishedAfter = youtubePublishedAfter(options.uploadDate);
  if (publishedAfter) params.set('publishedAfter', publishedAfter);
  if (options.eventType === 'live') params.set('eventType', 'live');
  if (options.pageToken) params.set('pageToken', options.pageToken);
  url.search = params.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YOUTUBE_QUOTA_EXCEEDED');
      if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || reason === 'ipRefererBlocked') throw new Error('YOUTUBE_API_KEY_INVALID');
      throw new Error('YOUTUBE_PROVIDER_UNAVAILABLE');
    }

    const items = (Array.isArray(payload?.items) ? payload.items : []).filter((item: any) =>
      typeof item?.id?.videoId === 'string' && VIDEO_ID.test(item.id.videoId)
    );
    const ids = items.map((item: any) => item.id.videoId as string);
    let details = new Map<string, { duration: number | null; embeddable: boolean | null; madeForKids: boolean }>();
    try {
      details = await youtubeApiVideoDetails(c, ids);
    } catch {
      // Search results remain usable when the optional duration/status lookup fails.
    }

    const videos: YouTubeVideoRecord[] = items.map((item: any) => {
      const snippet = item.snippet ?? {};
      const videoId = item.id.videoId as string;
      const detail = details.get(videoId);
      return {
        videoId,
        title: cleanText(snippet.title, 300, 'Untitled video'),
        description: cleanText(snippet.description, 5000),
        thumbnailUrl: searchThumbnail(snippet),
        channelId: cleanText(snippet.channelId, 64),
        channelTitle: cleanText(snippet.channelTitle, 180, 'YouTube'),
        channelAvatarUrl: null,
        publishedAt: typeof snippet.publishedAt === 'string' && !Number.isNaN(Date.parse(snippet.publishedAt))
          ? new Date(snippet.publishedAt).toISOString()
          : null,
        durationSeconds: detail?.duration ?? null,
        embeddable: detail?.embeddable ?? null,
        madeForKids: detail?.madeForKids ?? false,
        url: 'https://www.youtube.com/watch?v=' + videoId,
      };
    });
    return {
      videos,
      nextPageToken: typeof payload?.nextPageToken === 'string' ? payload.nextPageToken.slice(0, 1024) : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function youtubeApiSearchChannels(c: YouTubeContext, query: string): Promise<Array<{
  channelId: string; title: string; description: string; thumbnailUrl: string | null; url: string;
}>> {
  const apiKey = c.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY_MISSING');
  if (!await bumpRateBucket(c, 'data-api-daily', DAILY_API_LIMIT, DAILY_WINDOW_MS, 100)) {
    throw new Error('YOUTUBE_QUOTA_BUDGET_REACHED');
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({ part: 'snippet', type: 'channel', q: query, maxResults: '24', key: apiKey }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YOUTUBE_QUOTA_EXCEEDED');
      if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || reason === 'ipRefererBlocked') throw new Error('YOUTUBE_API_KEY_INVALID');
      throw new Error('YOUTUBE_PROVIDER_UNAVAILABLE');
    }
    return (Array.isArray(payload?.items) ? payload.items : []).flatMap((item: any) => {
      const channelId = typeof item?.id?.channelId === 'string' ? item.id.channelId : '';
      if (!CHANNEL_ID.test(channelId)) return [];
      const snippet = item.snippet ?? {};
      return [{
        channelId,
        title: cleanText(snippet.title, 180, 'YouTube channel'),
        description: cleanText(snippet.description, 1000),
        thumbnailUrl: searchThumbnail(snippet),
        url: 'https://www.youtube.com/channel/' + channelId,
      }];
    });
  } finally {
    clearTimeout(timeout);
  }
}


async function youtubeApiChannelUploads(c: YouTubeContext, channelId: string): Promise<YouTubeVideoRecord[]> {
  const apiKey = c.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey || !CHANNEL_ID.test(channelId)) return [];
  if (!await bumpRateBucket(c, 'data-api-daily', DAILY_API_LIMIT, DAILY_WINDOW_MS, 1)) return [];

  const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
  channelUrl.search = new URLSearchParams({ part: 'contentDetails', id: channelId, key: apiKey }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(channelUrl.toString(), { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({})) as any;
    const uploadsPlaylist = payload?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (typeof uploadsPlaylist !== 'string' || !uploadsPlaylist) return [];

    if (!await bumpRateBucket(c, 'data-api-daily', DAILY_API_LIMIT, DAILY_WINDOW_MS, 1)) return [];
    const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    playlistUrl.search = new URLSearchParams({
      part: 'snippet',
      playlistId: uploadsPlaylist,
      maxResults: '10',
      key: apiKey,
    }).toString();
    const playlistController = new AbortController();
    const playlistTimeout = setTimeout(() => playlistController.abort(), 8000);
    try {
      const playlistResponse = await fetch(playlistUrl.toString(), {
        headers: { Accept: 'application/json' },
        signal: playlistController.signal,
      });
      if (!playlistResponse.ok) return [];
      const playlistPayload = await playlistResponse.json().catch(() => ({})) as any;
      return (Array.isArray(playlistPayload?.items) ? playlistPayload.items : []).flatMap((item: any) => {
        const snippet = item?.snippet ?? {};
        const videoId = snippet?.resourceId?.videoId;
        if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return [];
        return [{
          videoId,
          title: cleanText(snippet.title, 300, 'Untitled video'),
          description: cleanText(snippet.description, 5000),
          thumbnailUrl: searchThumbnail(snippet),
          channelId,
          channelTitle: cleanText(snippet.videoOwnerChannelTitle ?? snippet.channelTitle, 180, 'YouTube'),
          channelAvatarUrl: null,
          publishedAt: typeof snippet.publishedAt === 'string' && !Number.isNaN(Date.parse(snippet.publishedAt))
            ? new Date(snippet.publishedAt).toISOString()
            : null,
          durationSeconds: null,
          embeddable: null,
          madeForKids: false,
          url: 'https://www.youtube.com/watch?v=' + videoId,
        }];
      });
    } finally {
      clearTimeout(playlistTimeout);
    }
  } finally {
    clearTimeout(timeout);
  }
}

type StoredRecommendationCandidate = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  source: string;
  seedVideoId: string | null;
  seedTitle: string | null;
  seedChannelId: string | null;
  seedChannelTitle: string | null;
  sourceRank: number;
  discoveredAt: number;
  expiresAt: number;
};

async function gatherUserRecommendations(c: YouTubeContext, userId: string, history: any[], now: number): Promise<void> {
  const state = await c.env.DB.prepare(
    'SELECT last_gathered_at AS lastGatheredAt,next_gather_at AS nextGatherAt ' +
    'FROM youtube_discovery_state WHERE user_id=?'
  ).bind(userId).first<{ lastGatheredAt: number; nextGatherAt: number }>();
  if (state && Number(state.nextGatherAt) > now) return;

  const seeds: any[] = [];
  const seenChannels = new Set<string>();
  for (const item of history) {
    const channelId = typeof item.channelId === 'string' ? item.channelId : '';
    const title = cleanText(item.title, 100);
    if (title.length < 5 || (channelId && seenChannels.has(channelId))) continue;
    if (channelId) seenChannels.add(channelId);
    seeds.push(item);
    if (seeds.length >= 4) break;
  }
  const savedChannels = await c.env.DB.prepare(
    'SELECT channel_id AS channelId,channel_title AS channelTitle FROM youtube_feed_channels WHERE user_id=? ORDER BY added_at DESC LIMIT 20'
  ).bind(userId).all<{ channelId: string; channelTitle: string }>();
  const channelIndex = new Map<string, string>();
  for (const item of history) {
    if (typeof item.channelId === 'string' && CHANNEL_ID.test(item.channelId)) {
      channelIndex.set(item.channelId, cleanText(item.channelTitle, 180, 'YouTube'));
    }
  }
  for (const item of savedChannels.results ?? []) {
    if (CHANNEL_ID.test(item.channelId)) channelIndex.set(item.channelId, cleanText(item.channelTitle, 180, 'YouTube'));
  }

  let gathered = 0;
  for (const seed of seeds) {
    const query = cleanText(seed.title, 100);
    try {
      const result = await youtubeApiSearchVideos(c, query, {
        order: 'relevance', duration: 'any', uploadDate: 'any', eventType: 'any', pageToken: null,
      });
      for (let index = 0; index < result.videos.length; index += 1) {
        const video = result.videos[index];
        if (!video.channelId || video.madeForKids || video.embeddable === false) continue;
        await c.env.DB.prepare(
          'INSERT INTO youtube_recommendation_candidates ' +
          '(user_id,video_id,title,description,thumbnail_url,channel_id,channel_title,published_at,duration_seconds,' +
          'source,seed_video_id,seed_title,seed_channel_id,seed_channel_title,source_rank,discovered_at,expires_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,' + "'search'" + ',?,?,?,?,?,?,?) ' +
          'ON CONFLICT(user_id,video_id) DO UPDATE SET title=excluded.title,description=excluded.description,' +
          'thumbnail_url=excluded.thumbnail_url,channel_id=excluded.channel_id,channel_title=excluded.channel_title,' +
          'published_at=excluded.published_at,duration_seconds=excluded.duration_seconds,source=excluded.source,' +
          'seed_video_id=excluded.seed_video_id,seed_title=excluded.seed_title,seed_channel_id=excluded.seed_channel_id,' +
          'seed_channel_title=excluded.seed_channel_title,source_rank=MIN(youtube_recommendation_candidates.source_rank,excluded.source_rank),' +
          'discovered_at=MAX(youtube_recommendation_candidates.discovered_at,excluded.discovered_at),' +
          'expires_at=MAX(youtube_recommendation_candidates.expires_at,excluded.expires_at)'
        ).bind(
          userId, video.videoId, video.title, video.description, video.thumbnailUrl, video.channelId, video.channelTitle,
          video.publishedAt, video.durationSeconds, seed.videoId, seed.title, seed.channelId, seed.channelTitle,
          index, now, now + 21 * 86400000,
        ).run();
        gathered += 1;
      }
    } catch {
      // Keep usable candidates from other seeds when one YouTube search fails.
    }
  }

  let channelRank = 0;
  for (const [channelId, channelTitle] of [...channelIndex.entries()].slice(0, 8)) {
    try {
      const uploads = await youtubeApiChannelUploads(c, channelId);
      for (const video of uploads) {
        if (!video.title || !video.videoId) continue;
        await c.env.DB.prepare(
          'INSERT INTO youtube_recommendation_candidates ' +
          '(user_id,video_id,title,description,thumbnail_url,channel_id,channel_title,published_at,duration_seconds,' +
          'source,seed_video_id,seed_title,seed_channel_id,seed_channel_title,source_rank,discovered_at,expires_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,\'channel_uploads\',NULL,?,?,?, ?,?,?) ' +
          'ON CONFLICT(user_id,video_id) DO UPDATE SET title=excluded.title,description=excluded.description,' +
          'thumbnail_url=excluded.thumbnail_url,channel_id=excluded.channel_id,channel_title=excluded.channel_title,' +
          'published_at=excluded.published_at,duration_seconds=excluded.duration_seconds,' +
          'source=excluded.source,source_rank=MIN(youtube_recommendation_candidates.source_rank,excluded.source_rank),' +
          'discovered_at=MAX(youtube_recommendation_candidates.discovered_at,excluded.discovered_at),' +
          'expires_at=MAX(youtube_recommendation_candidates.expires_at,excluded.expires_at)'
        ).bind(
          userId, video.videoId, video.title, video.description, video.thumbnailUrl, video.channelId,
          channelTitle || video.channelTitle, video.publishedAt, video.durationSeconds,
          channelTitle, channelId, channelTitle, channelRank++, now, now + 21 * 86400000,
        ).run();
        gathered += 1;
      }
    } catch {
      // One unavailable creator's uploads must not block other recommendations.
    }
  }

  const nextGatherAt = now + (gathered > 0 ? 21600000 : 3600000);
  await c.env.DB.prepare(
    'INSERT INTO youtube_discovery_state (user_id,active_at,last_gathered_at,next_gather_at,gather_cursor,updated_at) ' +
    'VALUES (?,?,?,?,0,?) ON CONFLICT(user_id) DO UPDATE SET active_at=excluded.active_at,' +
    'last_gathered_at=CASE WHEN excluded.last_gathered_at>0 THEN excluded.last_gathered_at ELSE youtube_discovery_state.last_gathered_at END,' +
    'next_gather_at=excluded.next_gather_at,updated_at=excluded.updated_at'
  ).bind(userId, now, gathered > 0 ? now : 0, nextGatherAt, now).run();
}

function safeRecommendationTuning(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const integerFields: Record<string, [number, number]> = {
    freshness: [0, 100], popularity: [-100, 100], channelGap: [1, 12], newChannelCap: [1, 6],
    shuffle: [0, 100], minWatchedPct: [0, 90], minMinutes: [0, 600], maxMinutes: [0, 600],
  };
  for (const [key, [min, max]] of Object.entries(integerFields)) {
    if (input[key] === undefined) continue;
    const number = Number(input[key]);
    if (!Number.isInteger(number) || number < min || number > max) return null;
    output[key] = number;
  }
  const enums: Record<string, number[]> = {
    wornAfter: [0, 3, 6, 12], recentDays: [14, 30, 60, 90],
    throwbackYears: [0, 1, 3], rewatchAfterDays: [30, 60, 180, 365],
    maxAgeDays: [0, 7, 30, 90, 365, 1095],
  };
  for (const [key, allowed] of Object.entries(enums)) {
    if (input[key] === undefined) continue;
    const number = Number(input[key]);
    if (!allowed.includes(number)) return null;
    output[key] = number;
  }
  for (const key of ['hidePastLive']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') return null;
      output[key] = input[key];
    }
  }
  if (input.strictness !== undefined) {
    if (!input.strictness || typeof input.strictness !== 'object' || Array.isArray(input.strictness)) return null;
    const strictness = input.strictness as Record<string, unknown>;
    const clean: Record<string, number> = {};
    for (const key of ['similar', 'new', 'throwback']) {
      const number = Number(strictness[key]);
      if (!Number.isInteger(number) || number < 0 || number > 100) return null;
      clean[key] = number;
    }
    output.strictness = clean;
  }
  if (input.shares !== undefined) {
    if (!input.shares || typeof input.shares !== 'object' || Array.isArray(input.shares)) return null;
    const shares = input.shares as Record<string, unknown>;
    const clean: Record<string, number> = {};
    for (const key of ['subscriptions', 'similar', 'new', 'throwback', 'rewatch']) {
      const number = Number(shares[key]);
      if (!Number.isInteger(number) || number < 0 || number > 100) return null;
      clean[key] = number;
    }
    if (Object.values(clean).every(number => number === 0)) return null;
    output.shares = clean;
  }
  return output;
}


export function registerYouTubeMediaRoutes(app: any): void {
  app.get('/api/v1/youtube/videos/search', async (c: YouTubeContext) => {
    noStore(c);
    const params = new URL(c.req.url).searchParams;
    const query = cleanText(params.get('q'), 100);
    if (query.length < 2) return fail(c, 400, 'VALIDATION_ERROR', 'Enter at least two characters to search YouTube.');
    if (!await permitRequest(c, 'video-search', 'public', 30)) {
      return fail(c, 429, 'RATE_LIMITED', 'Too many YouTube searches. Please try again shortly.');
    }
    const order = ['relevance', 'date', 'viewCount'].includes(params.get('order') ?? '') ? params.get('order')! : 'relevance';
    const duration = ['short', 'medium', 'long'].includes(params.get('duration') ?? '') ? params.get('duration')! : 'any';
    const uploadDate = ['today', 'week', 'month', 'year'].includes(params.get('uploadDate') ?? '') ? params.get('uploadDate')! : 'any';
    const eventType = params.get('eventType') === 'live' ? 'live' : 'any';
    const pageTokenRaw = params.get('pageToken');
    const pageToken = pageTokenRaw && pageTokenRaw.length <= 1024 && /^[A-Za-z0-9._=-]+$/.test(pageTokenRaw) ? pageTokenRaw : null;
    if (pageTokenRaw && !pageToken) return fail(c, 400, 'VALIDATION_ERROR', 'That YouTube search page is invalid.');
    try {
      const data = await youtubeApiSearchVideos(c, query, { order, duration, uploadDate, eventType, pageToken });
      return c.json({ success: true, data });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get('/api/v1/youtube/channels/search', async (c: YouTubeContext) => {
    noStore(c);
    const query = cleanText(new URL(c.req.url).searchParams.get('q'), 100);
    if (query.length < 2) return fail(c, 400, 'VALIDATION_ERROR', 'Enter at least two characters to search YouTube channels.');
    if (!await permitRequest(c, 'channel-search', 'public', 20)) {
      return fail(c, 429, 'RATE_LIMITED', 'Too many channel searches. Please try again shortly.');
    }
    try {
      const channels = await youtubeApiSearchChannels(c, query);
      return c.json({ success: true, data: { channels } });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get('/api/v1/youtube/recommendations', async (c: YouTubeContext) => {
    noStore(c);
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to load your personal recommendations.');
    if (!await permitRequest(c, 'recommendations-read', user.id, 60)) {
      return fail(c, 429, 'RATE_LIMITED', 'Too many recommendation requests. Please try again shortly.');
    }
    const now = Date.now();
    try {
      const historyResult = await c.env.DB.prepare(
        'SELECT video_id AS videoId,title,description,thumbnail_url AS thumbnailUrl,channel_id AS channelId,' +
        'channel_title AS channelTitle,published_at AS publishedAt,duration_seconds AS durationSeconds,' +
        'progress_seconds AS progressSeconds,completed,view_count AS viewCount,' +
        'first_viewed_at AS firstViewedAt,last_viewed_at AS lastViewedAt,updated_at AS updatedAt ' +
        'FROM youtube_watch_history WHERE user_id=? ORDER BY updated_at DESC LIMIT 600'
      ).bind(user.id).all();
      const history = historyResult.results ?? [];
      const activity = await c.env.DB.prepare(
        'INSERT INTO youtube_discovery_state (user_id,active_at,last_gathered_at,next_gather_at,gather_cursor,updated_at) ' +
        'VALUES (?,?,0,0,0,?) ON CONFLICT(user_id) DO UPDATE SET active_at=excluded.active_at,updated_at=excluded.updated_at'
      ).bind(user.id, now, now).run();
      void activity;

      const gather = gatherUserRecommendations(c, user.id, history, now).catch(() => undefined);
      const existingCandidates = await c.env.DB.prepare(
        'SELECT COUNT(*) AS count FROM youtube_recommendation_candidates WHERE user_id=? AND expires_at>?'
      ).bind(user.id, now).first<{ count: number }>();
      if (!existingCandidates || Number(existingCandidates.count) === 0 || !c.executionCtx?.waitUntil) {
        await gather;
      } else {
        c.executionCtx.waitUntil(gather);
      }
      const [candidateRows, feedbackRows, topicRows, impressionRows, settingRow] = await Promise.all([
        c.env.DB.prepare(
          'SELECT video_id AS videoId,title,description,thumbnail_url AS thumbnailUrl,channel_id AS channelId,' +
          'channel_title AS channelTitle,published_at AS publishedAt,duration_seconds AS durationSeconds,' +
          'source,seed_video_id AS seedVideoId,seed_title AS seedTitle,seed_channel_id AS seedChannelId,' +
          'seed_channel_title AS seedChannelTitle,source_rank AS sourceRank,discovered_at AS discoveredAt,expires_at AS expiresAt ' +
          'FROM youtube_recommendation_candidates WHERE user_id=? AND expires_at>? ORDER BY discovered_at DESC LIMIT 500'
        ).bind(user.id, now).all(),
        c.env.DB.prepare(
          'SELECT target_type AS targetType,target_id AS targetId,action FROM youtube_recommendation_feedback WHERE user_id=?'
        ).bind(user.id).all(),
        c.env.DB.prepare(
          'SELECT id,topic,kind,match_mode AS matchMode,share,created_at AS createdAt,expires_at AS expiresAt ' +
          'FROM youtube_recommendation_topics WHERE user_id=? AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC'
        ).bind(user.id, now).all(),
        c.env.DB.prepare(
          'SELECT video_id AS videoId,impression_count AS impressionCount FROM youtube_recommendation_impressions WHERE user_id=?'
        ).bind(user.id).all(),
        c.env.DB.prepare(
          'SELECT selection_json AS selectionJson FROM youtube_recommendation_settings WHERE user_id=?'
        ).bind(user.id).first<{ selectionJson: string }>(),
      ]);
      const feedback = feedbackRows.results ?? [];
      const topics = topicRows.results ?? [];
      return c.json({
        success: true,
        data: {
          history,
          candidates: candidateRows.results ?? [],
          feedback,
          topics,
          impressions: impressionRows.results ?? [],
          settings: settingRow?.selectionJson ? (() => {
            try { return JSON.parse(settingRow.selectionJson); } catch { return {}; }
          })() : {},
        },
      });
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Your recommendations are temporarily unavailable.');
    }
  });

  app.get('/api/v1/youtube/recommendations/settings', async (c: YouTubeContext) => {
    noStore(c);
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to view recommendation settings.');
    try {
      const row = await c.env.DB.prepare(
        'SELECT selection_json AS selectionJson FROM youtube_recommendation_settings WHERE user_id=?'
      ).bind(user.id).first<{ selectionJson: string }>();
      let settings: unknown = {};
      try { settings = row?.selectionJson ? JSON.parse(row.selectionJson) : {}; } catch { settings = {}; }
      return c.json({ success: true, data: { settings } });
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Recommendation settings are temporarily unavailable.');
    }
  });

  app.put('/api/v1/youtube/recommendations/settings', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to save recommendation settings.');
    const raw = await parseJsonBody(c) as any;
    const tuning = safeRecommendationTuning(raw?.tuning);
    if (!tuning) return fail(c, 400, 'VALIDATION_ERROR', 'The recommendation settings are invalid.');
    const settings = JSON.stringify({ active: cleanText(raw?.active, 40, 'custom'), tuning });
    const now = Date.now();
    try {
      await c.env.DB.prepare(
        'INSERT INTO youtube_recommendation_settings (user_id,selection_json,updated_at) VALUES (?,?,?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET selection_json=excluded.selection_json,updated_at=excluded.updated_at'
      ).bind(user.id, settings, now).run();
      return c.json({ success: true, data: { settings: JSON.parse(settings) } });
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Could not save recommendation settings.');
    }
  });

  app.get('/api/v1/youtube/recommendations/topics', async (c: YouTubeContext) => {
    noStore(c);
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to view recommendation topics.');
    try {
      const rows = await c.env.DB.prepare(
        'SELECT id,topic,kind,match_mode AS matchMode,share,created_at AS createdAt,expires_at AS expiresAt ' +
        'FROM youtube_recommendation_topics WHERE user_id=? ORDER BY created_at DESC'
      ).bind(user.id).all();
      return c.json({ success: true, data: { topics: rows.results ?? [] } });
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Recommendation topics are temporarily unavailable.');
    }
  });

  app.post('/api/v1/youtube/recommendations/topics', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to add recommendation topics.');
    const raw = await parseJsonBody(c) as any;
    const topic = cleanText(raw?.topic, 100);
    const kind = raw?.kind === 'block' ? 'block' : raw?.kind === 'interest' ? 'interest' : '';
    const share = Number(raw?.share ?? 0);
    const matchMode = raw?.matchMode === 'similar' ? 'similar' : 'words';
    const expiresAt = raw?.expiresAt === null || raw?.expiresAt === undefined ? null : Number(raw.expiresAt);
    if (topic.length < 2 || !kind || !Number.isInteger(share) || share < 0 || share > 35 ||
        (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now()))) {
      return fail(c, 400, 'VALIDATION_ERROR', 'The recommendation topic is invalid.');
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    try {
      await c.env.DB.prepare(
        'INSERT INTO youtube_recommendation_topics (id,user_id,topic,kind,match_mode,share,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(id, user.id, topic, kind, matchMode, share, now, expiresAt).run();
      return c.json({ success: true, data: { topic: { id, topic, kind, matchMode, share, createdAt: now, expiresAt } } }, 201);
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Could not add that recommendation topic.');
    }
  });

  app.delete('/api/v1/youtube/recommendations/topics/:topicId', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to remove recommendation topics.');
    const topicId = c.req.param('topicId');
    if (!/^[0-9a-f-]{36}$/i.test(topicId)) return fail(c, 400, 'VALIDATION_ERROR', 'That recommendation topic ID is invalid.');
    try {
      await c.env.DB.prepare('DELETE FROM youtube_recommendation_topics WHERE user_id=? AND id=?').bind(user.id, topicId).run();
      return c.json({ success: true, data: { removed: true } });
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Could not remove that recommendation topic.');
    }
  });

  app.post('/api/v1/youtube/recommendations/feedback', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to save recommendation feedback.');
    const raw = await parseJsonBody(c) as any;
    const targetType = raw?.targetType === 'video' || raw?.targetType === 'channel' ? raw.targetType : '';
    const targetId = cleanText(raw?.targetId, 128);
    const action = ['not_interested', 'dont_recommend_channel', 'dismiss_channel'].includes(raw?.action) ? raw.action : '';
    if (!targetType || !targetId || !action ||
        (targetType === 'video' && (!isYouTubeVideoId(targetId) || action !== 'not_interested')) ||
        (targetType === 'channel' && (!CHANNEL_ID.test(targetId) || action === 'not_interested'))) {
      return fail(c, 400, 'VALIDATION_ERROR', 'The recommendation feedback is invalid.');
    }
    try {
      await c.env.DB.prepare(
        'INSERT INTO youtube_recommendation_feedback (user_id,target_type,target_id,action,created_at) VALUES (?,?,?,?,?) ' +
        'ON CONFLICT(user_id,target_type,target_id,action) DO UPDATE SET created_at=excluded.created_at'
      ).bind(user.id, targetType, targetId, action, Date.now()).run();
      return c.json({ success: true, data: { saved: true } });
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Could not save recommendation feedback.');
    }
  });

  app.delete('/api/v1/youtube/recommendations/feedback/:targetType/:targetId/:action', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to change recommendation feedback.');
    const targetType = c.req.param('targetType');
    const targetId = c.req.param('targetId');
    const action = c.req.param('action');
    if (!['video', 'channel'].includes(targetType) ||
        !['not_interested', 'dont_recommend_channel', 'dismiss_channel'].includes(action)) {
      return fail(c, 400, 'VALIDATION_ERROR', 'The recommendation feedback is invalid.');
    }
    try {
      await c.env.DB.prepare(
        'DELETE FROM youtube_recommendation_feedback WHERE user_id=? AND target_type=? AND target_id=? AND action=?'
      ).bind(user.id, targetType, targetId, action).run();
      return c.json({ success: true, data: { removed: true } });
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Could not remove recommendation feedback.');
    }
  });

  app.post('/api/v1/youtube/recommendations/impressions', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to save recommendation impressions.');
    const raw = await parseJsonBody(c) as any;
    const ids: string[] = Array.isArray(raw?.videoIds)
      ? Array.from(new Set<string>(raw.videoIds.filter((value: unknown): value is string => isYouTubeVideoId(value)))).slice(0, 60)
      : [];
    if (ids.length === 0) return fail(c, 400, 'VALIDATION_ERROR', 'At least one recommended video ID is required.');
    const now = Date.now();
    try {
      const statements = ids.map((videoId: string) => c.env.DB.prepare(
        'INSERT INTO youtube_recommendation_impressions (user_id,video_id,impression_count,last_shown_at,last_viewed_at) ' +
        'VALUES (?,?,1,?,NULL) ON CONFLICT(user_id,video_id) DO UPDATE SET ' +
        'impression_count=youtube_recommendation_impressions.impression_count+1,last_shown_at=excluded.last_shown_at'
      ).bind(user.id, videoId, now));
      await c.env.DB.batch(statements);
      return c.json({ success: true, data: { recorded: ids.length } });
    } catch {
      return fail(c, 503, 'YOUTUBE_RECOMMENDATIONS_UNAVAILABLE', 'Could not record recommendation impressions.');
    }
  });

  // Public metadata is fetched through the official Data API. No API key or media URL reaches the browser.
  app.get('/api/v1/youtube/videos/:videoId', async (c: YouTubeContext) => {
    const videoId = c.req.param('videoId');
    if (!isYouTubeVideoId(videoId)) return fail(c, 400, 'VALIDATION_ERROR', 'That YouTube video ID is invalid.');
    if (!await permitRequest(c, 'video-metadata', 'public', 60)) return fail(c, 429, 'RATE_LIMITED', 'Too many video detail requests. Please try again shortly.');
    try {
      const video = await youtubeApiVideo(c, videoId);
      if (!video) return fail(c, 404, 'YOUTUBE_VIDEO_NOT_FOUND', 'This YouTube video is unavailable or no longer public.');
      c.header('Cache-Control', 'public, max-age=120, s-maxage=300');
      return c.json({ success: true, data: video });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get('/api/v1/youtube/history', async (c: YouTubeContext) => {
    noStore(c);
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to view your YouTube watch history.');
    if (!await permitRequest(c, 'history-read', user.id, 120)) return fail(c, 429, 'RATE_LIMITED', 'Too many history requests. Please try again shortly.');
    try {
      const result = await c.env.DB.prepare(
        'SELECT video_id AS videoId,title,description,thumbnail_url AS thumbnailUrl,channel_id AS channelId,' +
        'channel_title AS channelTitle,published_at AS publishedAt,duration_seconds AS durationSeconds,' +
        'progress_seconds AS progressSeconds,completed,view_count AS viewCount,' +
        'first_viewed_at AS firstViewedAt,last_viewed_at AS lastViewedAt,updated_at AS updatedAt ' +
        'FROM youtube_watch_history WHERE user_id=? ORDER BY updated_at DESC LIMIT 100'
      ).bind(user.id).all();
      return c.json({ success: true, data: { items: result.results ?? [] } });
    } catch {
      return fail(c, 503, 'YOUTUBE_HISTORY_UNAVAILABLE', 'Your YouTube watch history is temporarily unavailable.');
    }
  });

  app.post('/api/v1/youtube/history/view', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to save your YouTube viewing activity.');
    if (!await permitRequest(c, 'history-view', user.id, 180)) return fail(c, 429, 'RATE_LIMITED', 'Too many YouTube viewing events. Please try again shortly.');
    const parsed = parseVideoPayload(await parseJsonBody(c));
    if (!parsed) return fail(c, 400, 'VALIDATION_ERROR', 'The YouTube video details are invalid.');
    const updatedAt = Date.now();
    try {
      await c.env.DB.prepare(
        'INSERT INTO youtube_watch_history ' +
        '(user_id,video_id,title,description,thumbnail_url,channel_id,channel_title,published_at,duration_seconds,progress_seconds,completed,updated_at,view_count,first_viewed_at,last_viewed_at) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,0,0,?,1,?,?) ' +
        'ON CONFLICT(user_id,video_id) DO UPDATE SET title=excluded.title,description=excluded.description,' +
        'thumbnail_url=excluded.thumbnail_url,channel_id=excluded.channel_id,channel_title=excluded.channel_title,' +
        'published_at=excluded.published_at,duration_seconds=excluded.duration_seconds,updated_at=excluded.updated_at,' +
        'view_count=youtube_watch_history.view_count+1,last_viewed_at=excluded.last_viewed_at ' +
        'WHERE excluded.updated_at>=youtube_watch_history.updated_at'
      ).bind(user.id, parsed.videoId, parsed.title, parsed.description, parsed.thumbnailUrl, parsed.channelId,
        parsed.channelTitle, parsed.publishedAt, parsed.durationSeconds, updatedAt, updatedAt, updatedAt).run();
      await c.env.DB.prepare(
        'INSERT INTO youtube_recommendation_impressions (user_id,video_id,impression_count,last_shown_at,last_viewed_at) ' +
        'VALUES (?,?,0,NULL,?) ON CONFLICT(user_id,video_id) DO UPDATE SET last_viewed_at=excluded.last_viewed_at'
      ).bind(user.id, parsed.videoId, updatedAt).run();
      return c.json({ success: true, data: { viewed: true, updatedAt: updatedAt } });
    } catch {
      return fail(c, 503, 'YOUTUBE_HISTORY_UNAVAILABLE', 'Could not save your YouTube viewing activity.');
    }
  });

  app.post('/api/v1/youtube/history', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to save YouTube watch progress.');
    if (!await permitRequest(c, 'history-write', user.id, 180)) return fail(c, 429, 'RATE_LIMITED', 'YouTube progress is being saved too frequently. Try again shortly.');
    const parsed = parseVideoPayload(await parseJsonBody(c));
    if (!parsed) return fail(c, 400, 'VALIDATION_ERROR', 'The video or playback progress is invalid.');
    const updatedAt = Date.now();
    try {
      await c.env.DB.prepare(
        'INSERT INTO youtube_watch_history ' +
        '(user_id,video_id,title,description,thumbnail_url,channel_id,channel_title,published_at,duration_seconds,progress_seconds,completed,updated_at) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ' +
        'ON CONFLICT(user_id,video_id) DO UPDATE SET title=excluded.title,description=excluded.description,' +
        'thumbnail_url=excluded.thumbnail_url,channel_id=excluded.channel_id,channel_title=excluded.channel_title,' +
        'published_at=excluded.published_at,duration_seconds=excluded.duration_seconds,progress_seconds=excluded.progress_seconds,' +
        'completed=excluded.completed,updated_at=excluded.updated_at WHERE excluded.updated_at>=youtube_watch_history.updated_at'
      ).bind(user.id, parsed.videoId, parsed.title, parsed.description, parsed.thumbnailUrl, parsed.channelId,
        parsed.channelTitle, parsed.publishedAt, parsed.durationSeconds, parsed.progressSeconds, parsed.completed ? 1 : 0, updatedAt).run();
      return c.json({ success: true, data: { saved: true, updatedAt: updatedAt } });
    } catch {
      return fail(c, 503, 'YOUTUBE_HISTORY_UNAVAILABLE', 'Could not save your YouTube watch progress.');
    }
  });

  app.delete('/api/v1/youtube/history/:videoId', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to manage your YouTube watch history.');
    if (!await permitRequest(c, 'history-delete', user.id, 120)) return fail(c, 429, 'RATE_LIMITED', 'Too many history changes. Please try again shortly.');
    const videoId = c.req.param('videoId');
    if (!isYouTubeVideoId(videoId)) return fail(c, 400, 'VALIDATION_ERROR', 'That YouTube video ID is invalid.');
    try {
      await c.env.DB.prepare('DELETE FROM youtube_watch_history WHERE user_id=? AND video_id=?').bind(user.id, videoId).run();
      return c.json({ success: true, data: { removed: true } });
    } catch {
      return fail(c, 503, 'YOUTUBE_HISTORY_UNAVAILABLE', 'Could not remove that video from your history.');
    }
  });

  app.get('/api/v1/youtube/watch-later', async (c: YouTubeContext) => {
    noStore(c);
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to view your Watch Later list.');
    if (!await permitRequest(c, 'watch-later-read', user.id, 120)) return fail(c, 429, 'RATE_LIMITED', 'Too many Watch Later requests. Please try again shortly.');
    try {
      const result = await c.env.DB.prepare(
        'SELECT video_id AS videoId,title,description,thumbnail_url AS thumbnailUrl,channel_id AS channelId,' +
        'channel_title AS channelTitle,published_at AS publishedAt,duration_seconds AS durationSeconds,' +
        'saved_at AS savedAt FROM youtube_watch_later WHERE user_id=? ORDER BY saved_at DESC LIMIT 200'
      ).bind(user.id).all();
      return c.json({ success: true, data: { items: result.results ?? [] } });
    } catch {
      return fail(c, 503, 'YOUTUBE_WATCH_LATER_UNAVAILABLE', 'Your Watch Later list is temporarily unavailable.');
    }
  });

  app.post('/api/v1/youtube/watch-later', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to save videos to Watch Later.');
    if (!await permitRequest(c, 'watch-later-write', user.id, 60)) return fail(c, 429, 'RATE_LIMITED', 'Too many Watch Later changes. Please try again shortly.');
    const parsed = parseVideoPayload(await parseJsonBody(c));
    if (!parsed) return fail(c, 400, 'VALIDATION_ERROR', 'The video details are invalid.');
    const savedAt = Date.now();
    try {
      await c.env.DB.prepare(
        'INSERT INTO youtube_watch_later (user_id,video_id,title,description,thumbnail_url,channel_id,channel_title,published_at,duration_seconds,saved_at) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,video_id) DO UPDATE SET title=excluded.title,' +
        'description=excluded.description,thumbnail_url=excluded.thumbnail_url,channel_id=excluded.channel_id,' +
        'channel_title=excluded.channel_title,published_at=excluded.published_at,duration_seconds=excluded.duration_seconds'
      ).bind(user.id, parsed.videoId, parsed.title, parsed.description, parsed.thumbnailUrl, parsed.channelId,
        parsed.channelTitle, parsed.publishedAt, parsed.durationSeconds, savedAt).run();
      return c.json({ success: true, data: { saved: true } }, 201);
    } catch {
      return fail(c, 503, 'YOUTUBE_WATCH_LATER_UNAVAILABLE', 'Could not save this video to Watch Later.');
    }
  });

  app.delete('/api/v1/youtube/watch-later/:videoId', async (c: YouTubeContext) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const user = await signedInUser(c);
    if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Sign in to manage your Watch Later list.');
    if (!await permitRequest(c, 'watch-later-delete', user.id, 60)) return fail(c, 429, 'RATE_LIMITED', 'Too many Watch Later changes. Please try again shortly.');
    const videoId = c.req.param('videoId');
    if (!isYouTubeVideoId(videoId)) return fail(c, 400, 'VALIDATION_ERROR', 'That YouTube video ID is invalid.');
    try {
      await c.env.DB.prepare('DELETE FROM youtube_watch_later WHERE user_id=? AND video_id=?').bind(user.id, videoId).run();
      return c.json({ success: true, data: { removed: true } });
    } catch {
      return fail(c, 503, 'YOUTUBE_WATCH_LATER_UNAVAILABLE', 'Could not remove that video from Watch Later.');
    }
  });
}
