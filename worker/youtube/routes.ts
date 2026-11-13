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
  publishedAt: string | null;
  durationSeconds: number | null;
  embeddable: boolean;
  url: string;
};

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

async function shaHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function bumpRateBucket(c: YouTubeContext, bucket: string, limit: number, windowMs: number, cost = 1): Promise<boolean> {
  const bucketKey = await shaHex('youtube-media:' + bucket);
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

function parseVideoPayload(raw: unknown): Omit<YouTubeVideoRecord, 'embeddable' | 'url'> & { progressSeconds: number; completed: boolean } | null {
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

async function youtubeApiVideo(c: YouTubeContext, videoId: string): Promise<YouTubeVideoRecord | null> {
  const apiKey = c.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY_MISSING');
  if (!await bumpRateBucket(c, 'data-api-daily', DAILY_API_LIMIT, DAILY_WINDOW_MS, 1)) throw new Error('YOUTUBE_QUOTA_BUDGET_REACHED');

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.search = new URLSearchParams({ part: 'snippet,contentDetails,status', id: videoId, key: apiKey }).toString();
  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    const reason = payload?.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YOUTUBE_QUOTA_EXCEEDED');
    if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || reason === 'ipRefererBlocked') throw new Error('YOUTUBE_API_KEY_INVALID');
    throw new Error('YOUTUBE_PROVIDER_UNAVAILABLE');
  }
  const item = payload?.items?.[0];
  if (!item || item.id !== videoId) return null;
  const snippet = item.snippet ?? {};
  return {
    videoId: videoId,
    title: cleanText(snippet.title, 300, 'Untitled video'),
    description: cleanText(snippet.description, 5000),
    thumbnailUrl: safeYouTubeThumbnailUrl(snippet.thumbnails?.maxres?.url ?? snippet.thumbnails?.standard?.url ?? snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url),
    channelId: cleanText(snippet.channelId, 64),
    channelTitle: cleanText(snippet.channelTitle, 180, 'YouTube'),
    publishedAt: typeof snippet.publishedAt === 'string' && !Number.isNaN(Date.parse(snippet.publishedAt)) ? new Date(snippet.publishedAt).toISOString() : null,
    durationSeconds: parseYouTubeDuration(item.contentDetails?.duration),
    embeddable: item.status?.embeddable === true,
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

export function registerYouTubeMediaRoutes(app: any): void {
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
    try {
      const result = await c.env.DB.prepare(
        'SELECT video_id AS videoId,title,description,thumbnail_url AS thumbnailUrl,channel_id AS channelId,' +
        'channel_title AS channelTitle,published_at AS publishedAt,duration_seconds AS durationSeconds,' +
        'progress_seconds AS progressSeconds,completed,updated_at AS updatedAt ' +
        'FROM youtube_watch_history WHERE user_id=? ORDER BY updated_at DESC LIMIT 100'
      ).bind(user.id).all();
      return c.json({ success: true, data: { items: result.results ?? [] } });
    } catch {
      return fail(c, 503, 'YOUTUBE_HISTORY_UNAVAILABLE', 'Your YouTube watch history is temporarily unavailable.');
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
