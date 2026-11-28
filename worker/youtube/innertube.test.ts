import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerYouTubeInnerTubeRoutes } from './innertube';

type Handler = (context: any) => Promise<Response>;

function makeHarness(options: {
  env?: Record<string, unknown>;
  url?: string;
  headers?: Record<string, string>;
} = {}) {
  const handlers = new Map<string, Handler>();
  const responseHeaders: Record<string, string> = {};
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const DB = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values });
          return { first: async () => ({ attempts: 1 }) };
        },
      };
    },
  };
  const app = {
    get(path: string, handler: Handler) { handlers.set('GET ' + path, handler); },
  };
  registerYouTubeInnerTubeRoutes(app);
  const handler = handlers.get('GET /api/v1/youtube/innertube/search');
  if (!handler) throw new Error('YouTube.js search route was not registered');
  const headers = options.headers ?? { 'cf-connecting-ip': '192.0.2.25', cookie: 'kairo_session=must-not-forward' };
  const context = {
    env: { DB, APP_ENV: 'staging', YOUTUBE_JS_EXPERIMENT_ENABLED: 'true',
      YOUTUBE_JS_GATEWAY_URL: 'https://gateway.example', YOUTUBE_JS_GATEWAY_TOKEN: 'a'.repeat(32),
      ...(options.env ?? {}) },
    req: {
      url: options.url ?? 'https://kairo.example/api/v1/youtube/innertube/search?q=astronomy&limit=12',
      header: (name: string) => headers[name.toLowerCase()],
    },
    json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
    header: (name: string, value: string) => { responseHeaders[name] = value; },
  };
  return { handler, context, responseHeaders, statements };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('experimental YouTube.js proxy', () => {
  it('refuses production requests even if the feature flag is accidentally enabled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { handler, context } = makeHarness({ env: { APP_ENV: 'production' } });
    const response = await handler(context);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the deployment environment is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { handler, context } = makeHarness({ env: { APP_ENV: undefined } });
    const response = await handler(context);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates search input before reaching the gateway', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { handler, context } = makeHarness({
      url: 'https://kairo.example/api/v1/youtube/innertube/search?q=x',
    });
    const response = await handler(context);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes gateway results and does not forward Kairo cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { videos: [{
        videoId: 'abcdefghijk',
        title: 'Astronomy basics',
        description: 'A guide',
        thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
        channelId: 'UC1234567890',
        channelTitle: 'Science channel',
        publishedAt: '2026-11-27T12:00:00.000Z',
        durationSeconds: 301,
      }] },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { handler, context, responseHeaders, statements } = makeHarness();
    const response = await handler(context);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.meta).toMatchObject({ provider: 'youtube.js', experimental: true });
    expect(payload.data.videos).toHaveLength(1);
    expect(payload.data.videos[0]).toMatchObject({
      videoId: 'abcdefghijk',
      title: 'Astronomy basics',
      channelId: 'UC1234567890',
    });
    expect(responseHeaders['Cache-Control']).toBe('no-store');
    expect(statements).toHaveLength(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('q=astronomy');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer ' + 'a'.repeat(32));
    expect(new Headers(init.headers).has('Cookie')).toBe(false);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects non-YouTube thumbnails returned by the gateway', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { videos: [{
        videoId: 'abcdefghijk',
        title: 'Astronomy basics',
        thumbnailUrl: 'https://attacker.example/image.jpg',
      }] },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { handler, context } = makeHarness();
    const response = await handler(context);
    const payload = await response.json() as any;
    expect(response.status).toBe(200);
    expect(payload.data.videos[0].thumbnailUrl).toBe(null);
  });

  it('reports a gateway authentication failure distinctly without exposing upstream details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' },
    }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { handler, context } = makeHarness();
    const response = await handler(context);
    const payload = await response.json() as any;
    expect(response.status).toBe(502);
    expect(payload.error.code).toBe('YOUTUBE_JS_GATEWAY_AUTH_FAILED');
    expect(payload.error.message).not.toContain('Unauthorized.');
  });

  it('preserves the safe provider-unavailable code from the gateway', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Internal upstream detail.' },
    }), { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const { handler, context } = makeHarness();
    const response = await handler(context);
    const payload = await response.json() as any;
    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('YOUTUBE_JS_PROVIDER_UNAVAILABLE');
    expect(payload.error.message).not.toContain('Internal upstream detail.');
  });

  it('fails closed if the D1 rate limiter is unavailable', async () => {
    const { handler, context } = makeHarness();
    context.env.DB.prepare = () => ({ bind: () => ({ first: async () => { throw new Error('database unavailable'); } }) }) as any;
    const response = await handler(context);
    expect(response.status).toBe(503);
  });
});
