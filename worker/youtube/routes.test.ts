import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findSessionUser } from '../auth/session';
import { registerYouTubeMediaRoutes } from './routes';
import { isYouTubeVideoId, isYouTubeVideoEmbeddable, isYouTubeVideoMarkedMadeForKids, parseYouTubeDuration, safeYouTubeThumbnailUrl, youtubeChannelAvatarUrl } from './routes';

describe('YouTube media input validation', () => {
  it('accepts canonical 11-character video IDs only', () => {
    expect(isYouTubeVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeVideoId('short')).toBe(false);
    expect(isYouTubeVideoId('dQw4w9WgXcQ?x=1')).toBe(false);
    expect(isYouTubeVideoId('dQw4w9WgXc!')).toBe(false);
  });

  it('parses ISO 8601 video durations safely', () => {
    expect(parseYouTubeDuration('PT4M13S')).toBe(253);
    expect(parseYouTubeDuration('PT1H2M3S')).toBe(3723);
    expect(parseYouTubeDuration('P1DT2H')).toBe(93600);
    expect(parseYouTubeDuration('not-a-duration')).toBe(null);
    expect(parseYouTubeDuration('P99DT')).toBe(null);
  });

  it('accepts only HTTPS YouTube thumbnail hosts', () => {
    expect(safeYouTubeThumbnailUrl('https://i.ytimg.com/vi/demo/hqdefault.jpg')).toBe('https://i.ytimg.com/vi/demo/hqdefault.jpg');
    expect(safeYouTubeThumbnailUrl('https://yt3.ggpht.com/channel/avatar')).toBe('https://yt3.ggpht.com/channel/avatar');
    expect(safeYouTubeThumbnailUrl('http://i.ytimg.com/image.jpg')).toBe(null);
    expect(safeYouTubeThumbnailUrl('https://example.com/image.jpg')).toBe(null);
  });
});

describe('YouTube channel avatar metadata', () => {
  it('selects the best available official channel thumbnail', () => {
    expect(youtubeChannelAvatarUrl({
      maxres: { url: 'https://yt3.ggpht.com/channel/max' },
      high: { url: 'https://yt3.ggpht.com/channel/high' },
    })).toBe('https://yt3.ggpht.com/channel/max');
    expect(youtubeChannelAvatarUrl({
      high: { url: 'http://yt3.ggpht.com/channel/high' },
      medium: { url: 'https://yt3.ggpht.com/channel/medium' },
    })).toBe('https://yt3.ggpht.com/channel/medium');
  });

  it('rejects non-YouTube hosts and missing channel thumbnails', () => {
    expect(youtubeChannelAvatarUrl({ high: { url: 'https://example.com/avatar.png' } })).toBe(null);
    expect(youtubeChannelAvatarUrl(null)).toBe(null);
  });
});

describe('YouTube embedding status', () => {
  it('distinguishes explicit permission, explicit restriction, and a missing API field', () => {
    expect(isYouTubeVideoEmbeddable({ embeddable: true })).toBe(true);
    expect(isYouTubeVideoEmbeddable({ embeddable: false })).toBe(false);
    expect(isYouTubeVideoEmbeddable({})).toBe(null);
    expect(isYouTubeVideoEmbeddable(null)).toBe(null);
    expect(isYouTubeVideoEmbeddable(undefined)).toBe(null);
  });
});

describe('YouTube Made for Kids status', () => {
  it('detects the API-provided Made for Kids flag without guessing when absent', () => {
    expect(isYouTubeVideoMarkedMadeForKids({ madeForKids: true })).toBe(true);
    expect(isYouTubeVideoMarkedMadeForKids({ madeForKids: false })).toBe(false);
    expect(isYouTubeVideoMarkedMadeForKids({})).toBe(false);
    expect(isYouTubeVideoMarkedMadeForKids(null)).toBe(false);
  });
});


vi.mock('../auth/session', () => ({
  findSessionUser: vi.fn(),
}));

type CapturedStatement = { sql: string; values: unknown[] };

function makeHistoryViewHandler() {
  const handlers = new Map<string, (context: any) => Promise<Response>>();
  const app = {
    get: () => undefined,
    post: (path: string, handler: (context: any) => Promise<Response>) => {
      handlers.set('POST ' + path, handler);
    },
    delete: () => undefined,
  };
  registerYouTubeMediaRoutes(app);
  const handler = handlers.get('POST /api/v1/youtube/history/view');
  if (!handler) throw new Error('YouTube history-view route was not registered');
  return handler;
}

function makeViewContext(statements: CapturedStatement[], origin = 'https://kairo.example') {
  const body = {
    videoId: 'abcdefghijk',
    title: 'Example video',
    description: 'Example description',
    thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
    channelId: 'UC1234567890',
    channelTitle: 'Example channel',
    publishedAt: '2026-11-01T12:00:00.000Z',
    durationSeconds: 120,
  };
  const headers: Record<string, string> = {
    origin,
    'cf-connecting-ip': '192.0.2.10',
    cookie: 'kairo_session=session-value',
  };
  const responseHeaders: Record<string, string> = {};
  const DB = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values });
          return {
            first: async () => ({ attempts: 1 }),
            run: async () => ({ success: true }),
            all: async () => ({ results: [] }),
          };
        },
      };
    },
  };
  return {
    env: { DB },
    req: {
      url: 'https://kairo.example/api/v1/youtube/history/view',
      header: (name: string) => headers[name.toLowerCase()],
      param: () => '',
      json: async () => body,
    },
    json: (value: unknown, status = 200) => new Response(JSON.stringify(value), { status }),
    header: (name: string, value: string) => { responseHeaders[name] = value; },
    responseHeaders,
  };
}

describe('YouTube viewing activity', () => {
  beforeEach(() => {
    vi.mocked(findSessionUser).mockClear();
    vi.mocked(findSessionUser).mockResolvedValue({ id: 'account-1' } as any);
  });

  it('writes an account-scoped view event without resetting saved progress', async () => {
    const statements: CapturedStatement[] = [];
    const handler = makeHistoryViewHandler();
    const context = makeViewContext(statements);
    const response = await handler(context);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.viewed).toBe(true);
    expect(context.responseHeaders['Cache-Control']).toBe('no-store');

    const historyWrite = statements.find(statement => statement.sql.includes('INSERT INTO youtube_watch_history'));
    expect(historyWrite).toBeDefined();
    expect(historyWrite?.values).toEqual([
      'account-1', 'abcdefghijk', 'Example video', 'Example description',
      'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', 'UC1234567890',
      'Example channel', '2026-11-01T12:00:00.000Z', 120,
      expect.any(Number), expect.any(Number), expect.any(Number),
    ]);
    const conflictUpdate = historyWrite?.sql.split('DO UPDATE SET')[1] ?? '';
    expect(conflictUpdate).not.toMatch(/progress_seconds|completed/);
    expect(conflictUpdate).toContain('view_count=youtube_watch_history.view_count+1');
    expect(conflictUpdate).toContain('last_viewed_at=excluded.last_viewed_at');
    expect(historyWrite?.sql).toContain('VALUES (?,?,?,?,?,?,?,?,?,0,0,?,1,?,?)');
  });

  it('rejects cross-origin viewing events before touching account history', async () => {
    const statements: CapturedStatement[] = [];
    const handler = makeHistoryViewHandler();
    const context = makeViewContext(statements, 'https://attacker.example');
    const response = await handler(context);
    const payload = await response.json() as any;

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('ORIGIN_FORBIDDEN');
    expect(statements).toEqual([]);
    expect(findSessionUser).not.toHaveBeenCalled();
  });
});


function makeSearchHandler() {
  const handlers = new Map<string, (context: any) => Promise<Response>>();
  const app = {
    get: (path: string, handler: (context: any) => Promise<Response>) => { handlers.set('GET ' + path, handler); },
    post: () => undefined,
    delete: () => undefined,
  };
  registerYouTubeMediaRoutes(app);
  return handlers;
}

function makeSearchContext(url: string, statements: CapturedStatement[] = []) {
  const DB = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values });
          return {
            first: async () => ({ attempts: 1 }),
            run: async () => ({ success: true }),
            all: async () => ({ results: [] }),
          };
        },
      };
    },
  };
  return {
    env: { DB, YOUTUBE_DATA_API_KEY: 'test-key' },
    req: {
      url,
      header: (name: string) => name.toLowerCase() === 'cf-connecting-ip' ? '192.0.2.10' : undefined,
      param: () => '',
      json: async () => ({}),
    },
    json: (value: unknown, status = 200) => new Response(JSON.stringify(value), { status }),
    header: () => undefined,
  };
}

describe('YouTube discovery search routes', () => {
  it('registers video and channel search routes used by the Kairo feed and search page', () => {
    const handlers = makeSearchHandler();
    expect(handlers.has('GET /api/v1/youtube/videos/search')).toBe(true);
    expect(handlers.has('GET /api/v1/youtube/channels/search')).toBe(true);
  });

  it('searches videos and enriches results with duration metadata', async () => {
    const handlers = makeSearchHandler();
    const handler = handlers.get('GET /api/v1/youtube/videos/search');
    if (!handler) throw new Error('YouTube video search route was not registered');
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/search?')) {
        return new Response(JSON.stringify({
          items: [{
            id: { videoId: 'abcdefghijk' },
            snippet: {
              title: 'Example result',
              description: 'Example description',
              channelId: 'UC1234567890',
              channelTitle: 'Example channel',
              publishedAt: '2026-11-01T12:00:00.000Z',
              thumbnails: { high: { url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' } },
            },
          }],
          nextPageToken: 'next-page',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        items: [{
          id: 'abcdefghijk',
          contentDetails: { duration: 'PT2M3S' },
          status: { embeddable: true, madeForKids: false },
        }],
      }), { status: 200 });
    }));
    try {
      const response = await handler(makeSearchContext('https://kairo.example/api/v1/youtube/videos/search?q=example&order=date'));
      const payload = await response.json() as any;
      expect(response.status).toBe(200);
      expect(payload.data.videos[0]).toMatchObject({
        videoId: 'abcdefghijk',
        title: 'Example result',
        channelId: 'UC1234567890',
        channelTitle: 'Example channel',
        durationSeconds: 123,
        embeddable: true,
      });
      expect(payload.data.nextPageToken).toBe('next-page');
      expect(calls).toHaveLength(2);
      expect(calls[0]).toContain('order=date');
      expect(calls[1]).toContain('contentDetails%2Cstatus');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects empty search terms before using the YouTube API', async () => {
    const handlers = makeSearchHandler();
    const handler = handlers.get('GET /api/v1/youtube/videos/search');
    if (!handler) throw new Error('YouTube video search route was not registered');
    const response = await handler(makeSearchContext('https://kairo.example/api/v1/youtube/videos/search?q=x'));
    const payload = await response.json() as any;
    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });
});
