type InnerTubeBindings = {
  DB: D1Database;
  APP_ENV?: string;
  YOUTUBE_JS_EXPERIMENT_ENABLED?: string;
  YOUTUBE_JS_GATEWAY_URL?: string;
  YOUTUBE_JS_GATEWAY_TOKEN?: string;
};

type InnerTubeContext = {
  env: InnerTubeBindings;
  req: {
    url: string;
    header(name: string): string | undefined;
  };
  json(body: unknown, status?: number): Response;
  header(name: string, value: string): void;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^[A-Za-z0-9_-]{6,64}$/;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 24;

function fail(c: InnerTubeContext, status: number, code: string, message: string): Response {
  return c.json({ success: false, error: { code, message } }, status);
}

function noStore(c: InnerTubeContext): void {
  c.header('Cache-Control', 'no-store');
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength)
    : '';
}

function safeThumbnail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = host === 'i.ytimg.com' || host.endsWith('.ytimg.com')
      || host === 'yt3.ggpht.com' || host.endsWith('.ggpht.com');
    if (url.protocol !== 'https:' || !allowed || url.username || url.password || url.port) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeVideos(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const videos: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const candidate of value.slice(0, 48)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const item = candidate as Record<string, unknown>;
    const videoId = typeof item.videoId === 'string' ? item.videoId : '';
    const title = cleanText(item.title, 300);
    if (!VIDEO_ID.test(videoId) || !title || seen.has(videoId)) continue;
    seen.add(videoId);
    const rawChannelId = typeof item.channelId === 'string' ? item.channelId : '';
    const channelId = CHANNEL_ID.test(rawChannelId) ? rawChannelId : null;
    const rawPublishedAt = typeof item.publishedAt === 'string' ? item.publishedAt : '';
    const publishedAt = rawPublishedAt && !Number.isNaN(Date.parse(rawPublishedAt))
      ? new Date(rawPublishedAt).toISOString()
      : null;
    const duration = item.durationSeconds === null || item.durationSeconds === undefined
      ? null
      : Number(item.durationSeconds);
    videos.push({
      videoId,
      title,
      description: cleanText(item.description, 4000),
      thumbnailUrl: safeThumbnail(item.thumbnailUrl),
      channelId,
      channelTitle: cleanText(item.channelTitle, 180) || 'YouTube',
      publishedAt,
      durationSeconds: duration !== null && Number.isInteger(duration) && duration >= 0 && duration <= 604800 ? duration : null,
      url: 'https://www.youtube.com/watch?v=' + videoId,
    });
    if (videos.length === 24) break;
  }
  return videos;
}

async function rateLimit(c: InnerTubeContext): Promise<boolean> {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('kairo-youtubejs:' + ip),
  );
  const bucketKey = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const row = await c.env.DB.prepare(
    'INSERT INTO auth_rate_limits (bucket_key,window_started_at,attempts) VALUES (?,?,1) ' +
    'ON CONFLICT(bucket_key) DO UPDATE SET ' +
    'attempts=CASE WHEN window_started_at<=? THEN 1 ELSE attempts+1 END, ' +
    'window_started_at=CASE WHEN window_started_at<=? THEN ? ELSE window_started_at END ' +
    'RETURNING attempts'
  ).bind(bucketKey, now, now - RATE_WINDOW_MS, now - RATE_WINDOW_MS, now)
    .first<{ attempts: number }>();
  return Number(row?.attempts ?? RATE_LIMIT + 1) <= RATE_LIMIT;
}

function gatewayUrl(c: InnerTubeContext): URL | null {
  const raw = c.env.YOUTUBE_JS_GATEWAY_URL?.trim();
  if (!raw || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    const localDevelopment = c.env.APP_ENV === 'development'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol !== 'https:' && !localDevelopment) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export function registerYouTubeInnerTubeRoutes(app: any): void {
  app.get('/api/v1/youtube/innertube/search', async (c: InnerTubeContext) => {
    noStore(c);
    const environment = c.env.APP_ENV;
    if ((environment !== 'development' && environment !== 'staging')
      || c.env.YOUTUBE_JS_EXPERIMENT_ENABLED !== 'true') {
      return fail(c, 404, 'YOUTUBE_JS_EXPERIMENT_DISABLED', 'This discovery provider is not enabled.');
    }

    const params = new URL(c.req.url).searchParams;
    const query = (params.get('q') ?? '').trim().replace(/\s+/g, ' ');
    const limit = Number(params.get('limit') ?? 24);
    if (query.length < 2 || query.length > 80) {
      return fail(c, 400, 'VALIDATION_ERROR', 'q must contain 2–80 characters.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 24) {
      return fail(c, 400, 'VALIDATION_ERROR', 'limit must be an integer from 1 to 24.');
    }

    const token = c.env.YOUTUBE_JS_GATEWAY_TOKEN?.trim();
    const target = gatewayUrl(c);
    if (!token || token.length < 24 || !target) {
      return fail(c, 503, 'YOUTUBE_JS_GATEWAY_NOT_CONFIGURED', 'Experimental YouTube discovery is not configured.');
    }

    try {
      if (!await rateLimit(c)) {
        c.header('Retry-After', '900');
        return fail(c, 429, 'RATE_LIMITED', 'Experimental YouTube discovery has reached its request limit.');
      }
    } catch {
      return fail(c, 503, 'YOUTUBE_JS_RATE_LIMIT_UNAVAILABLE', 'Experimental YouTube discovery is temporarily unavailable.');
    }

    target.pathname = target.pathname.replace(/\/$/, '') + '/api/search';
    target.search = new URLSearchParams({ q: query, limit: String(limit) }).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      // Do not forward the browser's Kairo session cookie or any client-provided headers.
      const response = await fetch(target.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + token,
        },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as {
        success?: unknown;
        data?: { videos?: unknown };
        error?: { code?: unknown };
      } | null;
      const upstreamCode = typeof payload?.error?.code === 'string' ? payload.error.code : null;
      if (!response.ok) {
        if (response.status === 401 || upstreamCode === 'UNAUTHORIZED') {
          return fail(c, 502, 'YOUTUBE_JS_GATEWAY_AUTH_FAILED', 'Experimental YouTube discovery could not authenticate with its gateway.');
        }
        if (upstreamCode === 'GATEWAY_NOT_CONFIGURED') {
          return fail(c, 503, 'YOUTUBE_JS_GATEWAY_NOT_CONFIGURED', 'Experimental YouTube discovery is not configured.');
        }
        if (upstreamCode === 'UPSTREAM_UNAVAILABLE') {
          return fail(c, 503, 'YOUTUBE_JS_PROVIDER_UNAVAILABLE', 'YouTube discovery is temporarily unavailable.');
        }
        return fail(c, 503, 'YOUTUBE_JS_UPSTREAM_UNAVAILABLE', 'Experimental YouTube discovery is temporarily unavailable.');
      }
      if (!payload?.success) {
        return fail(c, 503, 'YOUTUBE_JS_UPSTREAM_UNAVAILABLE', 'Experimental YouTube discovery is temporarily unavailable.');
      }
      const videos = normalizeVideos(payload.data?.videos);
      return c.json({
        success: true,
        data: { videos },
        meta: { provider: 'youtube.js', experimental: true },
      });
    } catch {
      return fail(c, 503, 'YOUTUBE_JS_UPSTREAM_UNAVAILABLE', 'Experimental YouTube discovery is temporarily unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  });
}
