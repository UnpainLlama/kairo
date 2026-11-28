import { Innertube } from 'youtubei.js/cf-worker';

type Env = {
  APP_ENV?: string;
  GATEWAY_SECRET?: string;
};

type CacheAdapter = {
  cache_dir: string;
  get(key: string): Promise<ArrayBuffer | undefined>;
  set(key: string, value: ArrayBuffer): Promise<void>;
  remove(key: string): Promise<void>;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 24;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function plainText(value: unknown, maxLength: number): string {
  if (typeof value === 'string') return value.trim().slice(0, maxLength);
  if (value && typeof value === 'object') {
    const candidate = (value as { text?: unknown }).text;
    if (typeof candidate === 'string') return candidate.trim().slice(0, maxLength);
  }
  return '';
}

function safeThumbnail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = host === 'i.ytimg.com'
      || host.endsWith('.ytimg.com')
      || host === 'yt3.ggpht.com'
      || host.endsWith('.ggpht.com');
    if (url.protocol !== 'https:' || !allowed || url.username || url.password || url.port) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeVideo(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const video = value as Record<string, any>;
  const videoId = typeof video.id === 'string' ? video.id : typeof video.video_id === 'string' ? video.video_id : '';
  const title = plainText(video.title, 300);
  if (!VIDEO_ID.test(videoId) || !title) return null;

  const thumbnails = Array.isArray(video.thumbnails) ? video.thumbnails : [];
  let thumbnailUrl: string | null = null;
  for (const thumbnail of [...thumbnails].reverse()) {
    thumbnailUrl = safeThumbnail(thumbnail?.url);
    if (thumbnailUrl) break;
  }

  const author = video.author && typeof video.author === 'object' ? video.author as Record<string, unknown> : {};
  const rawChannelId = typeof author.id === 'string' ? author.id : typeof author.channel_id === 'string' ? author.channel_id : '';
  const channelId = CHANNEL_ID.test(rawChannelId) ? rawChannelId : null;
  const channelTitle = plainText(author.name, 180) || 'YouTube';
  const rawPublished = typeof video.published === 'string' ? video.published : null;
  const publishedAt = rawPublished && !Number.isNaN(Date.parse(rawPublished))
    ? new Date(rawPublished).toISOString()
    : null;
  const rawDuration = Number(video.duration?.seconds);
  const durationSeconds = Number.isFinite(rawDuration) && rawDuration >= 0 && rawDuration <= 604800
    ? Math.floor(rawDuration)
    : null;
  const description = plainText(video.description, 4000);

  return {
    videoId,
    title,
    description,
    thumbnailUrl,
    channelId,
    channelTitle,
    publishedAt,
    durationSeconds,
    url: 'https://www.youtube.com/watch?v=' + videoId,
  };
}

function createMemoryCache(): CacheAdapter {
  const values = new Map<string, ArrayBuffer>();
  return {
    cache_dir: 'kairo-youtubejs-ephemeral',
    get: async (key) => values.get(key),
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
}

async function handleSearch(request: Request, env: Env): Promise<Response> {
  if (env.APP_ENV !== 'development' && env.APP_ENV !== 'staging') {
    return json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  }

  const configuredSecret = env.GATEWAY_SECRET?.trim() ?? '';
  if (!configuredSecret) {
    return json({ success: false, error: { code: 'GATEWAY_NOT_CONFIGURED', message: 'The discovery gateway is not configured.' } }, 503);
  }
  const authorization = request.headers.get('Authorization') ?? '';
  const suppliedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!constantTimeEqual(suppliedSecret, configuredSecret)) {
    return json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } }, 401);
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ');
  const requestedLimit = Number(url.searchParams.get('limit') ?? MAX_RESULTS);
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    return json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'q must contain 2–80 characters.' } }, 400);
  }
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_RESULTS) {
    return json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'limit must be an integer from 1 to 24.' } }, 400);
  }

  try {
    // Deliberately anonymous: do not supply cookies, OAuth credentials or user session data.
    // This cache adapter is process-local because Cloudflare's Cache API expects URL keys.
    const youtube = await Innertube.create({
      cache: createMemoryCache(),
      generate_session_locally: true,
      enable_session_cache: false,
      lang: 'en',
      location: 'ZA',
    });
    const search = await youtube.search(query, { type: 'video' });
    const videos = Array.from(search.videos ?? [])
      .map(normalizeVideo)
      .filter((video): video is NonNullable<typeof video> => video !== null)
      .slice(0, requestedLimit);

    return json({
      success: true,
      data: { videos },
      meta: { provider: 'youtube.js', experimental: true },
    });
  } catch {
    return json({
      success: false,
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'YouTube discovery is temporarily unavailable.' },
    }, 503);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ success: true, environment: env.APP_ENV ?? 'unknown' });
    }
    if (request.method === 'GET' && url.pathname === '/api/search') {
      return handleSearch(request, env);
    }
    return json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  },
};
