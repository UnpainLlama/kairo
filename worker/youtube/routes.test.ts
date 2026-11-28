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
      'Example channel', '2026-11-01T12:00:00.000Z', 120, expect.any(Number),
    ]);
    const conflictUpdate = historyWrite?.sql.split('DO UPDATE SET')[1] ?? '';
    expect(conflictUpdate).not.toMatch(/progress_seconds|completed/);
    expect(historyWrite?.sql).toContain('VALUES (?,?,?,?,?,?,?,?,?,0,0,?)');
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
