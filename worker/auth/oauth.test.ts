import { describe, expect, it, vi } from 'vitest';
import { registerGoogleAuthRoutes } from './google';
import { isMarkedYouTubeShort, registerYouTubeAuthRoutes } from './youtube';

type RouteHandler = (context: any) => Promise<Response>;

function routeFor(register: (app: any) => void, path: string, method: 'get' | 'post' | 'delete' = 'get'): RouteHandler {
  const routes = new Map<string, RouteHandler>();
  register({
    get: (route: string, handler: RouteHandler) => { routes.set(route, handler); routes.set(`GET ${route}`, handler); },
    post: (route: string, handler: RouteHandler) => routes.set(`POST ${route}`, handler),
    delete: (route: string, handler: RouteHandler) => routes.set(`DELETE ${route}`, handler),
  });
  const handler = routes.get(`${method.toUpperCase()} ${path}`) ?? routes.get(path);
  if (!handler) throw new Error(`Route not registered: ${method.toUpperCase()} ${path}`);
  return handler;
}

function makeContext(options: {
  url: string;
  env: Record<string, unknown>;
  cookie?: string;
  origin?: string;
  body?: unknown;
}) {
  const responseHeaders = new Map<string, string[]>();
  let redirectedTo: string | null = null;
  let jsonBody: unknown = null;

  const context = {
    env: options.env,
    get: (name: string) => name === 'requestId' ? 'test-request-id' : undefined,
    req: {
      url: options.url,
      header: (name: string) => name.toLowerCase() === 'cookie' ? options.cookie : name.toLowerCase() === 'origin' ? options.origin : undefined,
      query: (name: string) => new URL(options.url).searchParams.get(name) ?? undefined,
      json: async () => options.body,
    },
    redirect: (url: string, status = 302) => {
      redirectedTo = url;
      return new Response(null, { status, headers: { Location: url } });
    },
    header: (name: string, value: string, config?: { append?: boolean }) => {
      const key = name.toLowerCase();
      const values = responseHeaders.get(key) ?? [];
      responseHeaders.set(key, config?.append ? [...values, value] : [value]);
    },
    json: (body: unknown, status = 200) => {
      jsonBody = body;
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    },
  };

  return {
    context,
    get redirectedTo() { return redirectedTo; },
    get jsonBody() { return jsonBody; },
    headers: responseHeaders,
  };
}

function mockDb(options: {
  authenticated?: boolean;
  recentSession?: boolean;
  failYoutubeStateInsert?: boolean;
  youtubeRateLimitAttempts?: number;
  youtubeGlobalRateLimitAttempts?: number;
  savedChannels?: Array<Record<string, unknown>>;
  runCalls?: Array<{ sql: string; values: unknown[] }>;
} = {}): D1Database {
  const authenticated = options.authenticated ?? true;
  let youtubeRateLimitReads = 0;
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        run: async () => {
          options.runCalls?.push({ sql, values });
          if (options.failYoutubeStateInsert && sql.includes('INSERT INTO youtube_oauth_states')) {
            throw new Error('D1_ERROR: no such table: youtube_oauth_states');
          }
          return { success: true, meta: { changes: 1 } };
        },
        first: async () => {
          if (sql.includes('INSERT INTO auth_rate_limits')) {
            youtubeRateLimitReads += 1;
            return { attempts: youtubeRateLimitReads === 1 ? (options.youtubeRateLimitAttempts ?? 1) : (options.youtubeGlobalRateLimitAttempts ?? 1) };
          }
          if (sql.includes('FROM sessions s') && sql.includes('INNER JOIN user_profiles')) {
            return authenticated ? {
              userId: 'user-123',
              displayName: 'Kairo tester',
              email: 'tester@example.com',
              emailVerifiedAt: null,
              role: 'user',
            } : null;
          }
          if (sql.includes('SELECT id FROM sessions')) return authenticated && options.recentSession !== false ? { id: 'session-123' } : null;
          return null;
        },
        all: async () => ({ results: sql.includes('FROM youtube_feed_channels') ? (options.savedChannels ?? []) : [] }),
      }),
    }),
  };
  return db as unknown as D1Database;
}

const canonicalOrigin = 'https://kairo-anime-platform-staging.unpainllama.workers.dev';

describe('Google OAuth canonical callback', () => {
  it('uses APP_BASE_URL, not the inbound Host, for the authorization redirect', async () => {
    const handler = routeFor(registerGoogleAuthRoutes, '/api/v1/auth/google');
    const ctx = makeContext({
      url: 'https://untrusted-alias.example/api/v1/auth/google',
      env: {
        DB: mockDb(),
        APP_BASE_URL: canonicalOrigin,
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
      },
    });

    const response = await handler(ctx.context);
    expect(response.status).toBe(302);
    const location = new URL(ctx.redirectedTo!);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(
      `${canonicalOrigin}/api/v1/auth/google/callback`,
    );
    expect(ctx.headers.get('set-cookie')?.[0]).toContain('Secure');
  });

  it('refuses a non-canonical APP_BASE_URL with a path', async () => {
    const handler = routeFor(registerGoogleAuthRoutes, '/api/v1/auth/google');
    const ctx = makeContext({
      url: 'https://kairo.example/api/v1/auth/google',
      env: {
        DB: mockDb(),
        APP_BASE_URL: `${canonicalOrigin}/unexpected-path`,
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
      },
    });

    const response = await handler(ctx.context);
    expect(response.status).toBe(503);
    expect(ctx.redirectedTo).toBeNull();
    expect(ctx.jsonBody).toMatchObject({
      success: false,
      error: { code: 'GOOGLE_AUTH_UNAVAILABLE' },
    });
  });

  it('returns Google account-link token-exchange failures to Settings', async () => {
    const handler = routeFor(registerGoogleAuthRoutes, '/api/v1/auth/google/callback');
    const state = 'S'.repeat(43);
    const db = {
      prepare: (sql: string) => ({
        bind: (..._values: unknown[]) => ({
          run: async () => ({ success: true, meta: { changes: 1 } }),
          first: async () => {
            if (sql.includes('FROM google_oauth_states')) {
              return { nonce: 'test-nonce', code_verifier: 'test-verifier', link_user_id: 'user-123', expires_at: Date.now() + 60_000, consumed_at: null };
            }
            if (sql.includes('FROM sessions s') && sql.includes('INNER JOIN user_profiles')) {
              return { userId: 'user-123', displayName: 'Kairo tester', email: 'tester@example.com', emailVerifiedAt: null, role: 'user' };
            }
            if (sql.includes('SELECT id FROM sessions')) return { id: 'session-123' };
            return null;
          },
        }),
      }),
    } as unknown as D1Database;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/auth/google/callback?state=${state}&code=test-code`,
        cookie: `kairo_oauth_state=${state}; kairo_session=${'a'.repeat(43)}`,
        env: {
          DB: db,
          APP_BASE_URL: canonicalOrigin,
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
        },
      });

      const response = await handler(ctx.context);
      const location = new URL(ctx.redirectedTo!);
      expect(response.status).toBe(302);
      expect(location.pathname).toBe('/settings');
      expect(location.searchParams.get('google')).toBe('token_exchange_failed');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('preserves the Google-link action when a recent sign-in is required', async () => {
    const handler = routeFor(registerGoogleAuthRoutes, '/api/v1/auth/google');
    const ctx = makeContext({
      url: `${canonicalOrigin}/api/v1/auth/google?intent=link`,
      cookie: `kairo_session=${'a'.repeat(43)}`,
      env: {
        DB: mockDb({ recentSession: false }),
        APP_BASE_URL: canonicalOrigin,
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
      },
    });

    const response = await handler(ctx.context);
    const location = new URL(ctx.redirectedTo!);
    expect(response.status).toBe(302);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('google')).toBe('reauth_required');
    expect(location.searchParams.get('continue')).toBe('google-link');
  });
});


describe('YouTube public channel search', () => {
  it('uses the Worker API key without requiring per-user YouTube OAuth', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/channels/search');
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://www.googleapis.com');
      expect(url.pathname).toBe('/youtube/v3/search');
      expect(url.searchParams.get('key')).toBe('worker-test-key');
      expect(url.searchParams.get('type')).toBe('channel');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return new Response(JSON.stringify({
        items: [{
          id: { channelId: 'UC1234567890' },
          snippet: {
            title: 'Public creator',
            description: 'A public channel',
            thumbnails: { default: { url: 'https://example.com/channel.jpg' } },
          },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', request);
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/youtube/channels/search?q=creator`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        env: { DB: mockDb(), YOUTUBE_DATA_API_KEY: 'worker-test-key' },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        success: true,
        data: { channels: [{ channelId: 'UC1234567890', title: 'Public creator', isAdded: false }] },
      });
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns a safe configuration error when the Worker API key is missing', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/channels/search');
    const ctx = makeContext({
      url: `${canonicalOrigin}/api/v1/youtube/channels/search?q=creator`,
      cookie: `kairo_session=${'a'.repeat(43)}`,
      env: { DB: mockDb() },
    });
    const response = await handler(ctx.context);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'YOUTUBE_API_KEY_MISSING' },
    });
  });
});

describe('YouTube OAuth canonical callback', () => {
  it('uses APP_BASE_URL and requires a recent authenticated Kairo session', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/auth/youtube');
    const ctx = makeContext({
      url: 'https://untrusted-alias.example/api/v1/auth/youtube',
      cookie: `kairo_session=${'a'.repeat(43)}`,
      env: {
        DB: mockDb(),
        APP_BASE_URL: canonicalOrigin,
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
        YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
      },
    });

    const response = await handler(ctx.context);
    expect(response.status).toBe(302);
    const location = new URL(ctx.redirectedTo!);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(
      `${canonicalOrigin}/api/v1/auth/youtube/callback`,
    );
    expect(location.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/youtube.readonly');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(ctx.headers.get('set-cookie')?.[0]).toContain('Secure');
  });

  it('does not start authorization without an authenticated Kairo session', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/auth/youtube');
    const ctx = makeContext({
      url: `${canonicalOrigin}/api/v1/auth/youtube`,
      cookie: `kairo_session=${'a'.repeat(43)}`,
      env: {
        DB: mockDb({ authenticated: false }),
        APP_BASE_URL: canonicalOrigin,
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
        YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
      },
    });

    const response = await handler(ctx.context);
    expect(response.status).toBe(302);
    expect(new URL(ctx.redirectedTo!).origin).toBe(canonicalOrigin);
    expect(new URL(ctx.redirectedTo!).pathname).toBe('/login');
  });

  it('preserves the YouTube connection action when a recent sign-in is required', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/auth/youtube');
    const ctx = makeContext({
      url: `${canonicalOrigin}/api/v1/auth/youtube`,
      cookie: `kairo_session=${'a'.repeat(43)}`,
      env: {
        DB: mockDb({ recentSession: false }),
        APP_BASE_URL: canonicalOrigin,
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
        YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
      },
    });

    const response = await handler(ctx.context);
    const location = new URL(ctx.redirectedTo!);
    expect(response.status).toBe(302);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('youtube')).toBe('reauth_required');
    expect(location.searchParams.get('continue')).toBe('youtube-connect');
  });
});


describe('YouTube OAuth configuration diagnostics', () => {
  it('reports an invalid encryption-key format without logging the key', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/auth/youtube');
    const exposedValue = 'x'.repeat(44);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/auth/youtube`,
        env: {
          DB: mockDb(),
          APP_BASE_URL: canonicalOrigin,
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
          YOUTUBE_TOKEN_ENCRYPTION_KEY: exposedValue,
        },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: 'YOUTUBE_CONNECT_UNAVAILABLE' },
        meta: { requestId: 'test-request-id' },
      });
      const logged = diagnostic.mock.calls.map(([value]) => String(value)).join('\n');
      expect(logged).toContain('youtube_configuration_unavailable');
      expect(logged).toContain('YOUTUBE_TOKEN_ENCRYPTION_KEY');
      expect(logged).toContain('length_not_43');
      expect(logged).toContain('test-request-id');
      expect(logged).not.toContain(exposedValue);
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('identifies missing Cloudflare bindings by name only', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/auth/youtube');
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/auth/youtube`,
        env: {
          DB: mockDb(),
          APP_BASE_URL: canonicalOrigin,
          GOOGLE_CLIENT_ID: 'google-client-id',
          YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
        },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(503);
      const logged = diagnostic.mock.calls.map(([value]) => String(value)).join('\n');
      expect(logged).toContain('missing_bindings');
      expect(logged).toContain('GOOGLE_CLIENT_SECRET');
      expect(logged).not.toContain('google-client-id');
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('identifies a non-origin APP_BASE_URL', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/auth/youtube');
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/auth/youtube`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        env: {
          DB: mockDb(),
          APP_BASE_URL: `${canonicalOrigin}/unexpected-path`,
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
          YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
        },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(503);
      const logged = diagnostic.mock.calls.map(([value]) => String(value)).join('\n');
      expect(logged).toContain('"component":"APP_BASE_URL"');
      expect(logged).toContain('must_be_origin_only');
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('logs the D1 state-table failure without exposing OAuth state or verifier values', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/auth/youtube');
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/auth/youtube`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        env: {
          DB: mockDb({ failYoutubeStateInsert: true }),
          APP_BASE_URL: canonicalOrigin,
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
          YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
        },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(503);
      const logged = diagnostic.mock.calls.map(([value]) => String(value)).join('\n');
      expect(logged).toContain('youtube_oauth_state_store_failed');
      expect(logged).toContain('no such table: youtube_oauth_states');
      expect(logged).toContain('test-request-id');
    } finally {
      diagnostic.mockRestore();
    }
  });
});


describe('Kairo-curated YouTube channel access controls', () => {
  it('requires an authenticated Kairo session', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/channels/search');
    const ctx = makeContext({
      url: `${canonicalOrigin}/api/v1/youtube/channels/search?q=creator`,
      cookie: `kairo_session=${'a'.repeat(43)}`,
      env: { DB: mockDb({ authenticated: false }), YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43) },
    });
    const response = await handler(ctx.context);
    expect(response.status).toBe(401);
    expect(ctx.jsonBody).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    expect(ctx.headers.get('cache-control')).toEqual(['no-store']);
  });

  it('uses the public API key and does not require a per-user YouTube connection', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/channels/search');
    const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('key')).toBe('worker-test-key');
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', providerFetch);
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/youtube/channels/search?q=creator`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        env: { DB: mockDb(), YOUTUBE_DATA_API_KEY: 'worker-test-key' },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(200);
      expect(ctx.jsonBody).toMatchObject({ success: true, data: { channels: [] } });
      expect(providerFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stores the uploads playlist ID when a public channel is added', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/channels', 'post');
    const runCalls: Array<{ sql: string; values: unknown[] }> = [];
    const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('key')).toBe('worker-test-key');
      expect(url.searchParams.get('part')).toBe('snippet,contentDetails');
      return new Response(JSON.stringify({
        items: [{
          id: 'UCabc123',
          snippet: { title: 'Example creator', description: 'Public channel', thumbnails: { high: { url: 'https://img.example/channel.jpg' } } },
          contentDetails: { relatedPlaylists: { uploads: 'UUabc123' } },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', providerFetch);
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/youtube/channels`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        origin: canonicalOrigin,
        body: { channelId: 'UCabc123' },
        env: { DB: mockDb({ runCalls }), YOUTUBE_DATA_API_KEY: 'worker-test-key' },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(201);
      expect(ctx.jsonBody).toMatchObject({ success: true, data: { added: true, channel: { channelId: 'UCabc123' } } });
      const insert = runCalls.find(call => call.sql.includes('INSERT INTO youtube_feed_channels'));
      expect(insert?.sql).toContain('upload_playlist_id');
      expect(insert?.values).toContain('UUabc123');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('loads public uploads from the saved playlist without a YouTube OAuth token', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/feed');
    const providerFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/youtube/v3/playlistItems');
      expect(url.searchParams.get('key')).toBe('worker-test-key');
      expect(url.searchParams.get('playlistId')).toBe('UUabc123');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return new Response(JSON.stringify({
        items: [{
          snippet: {
            resourceId: { videoId: 'video123' },
            title: 'Latest public upload',
            description: 'A regular video',
            channelTitle: 'Example creator',
            publishedAt: '2026-11-13T10:00:00Z',
            thumbnails: { high: { url: 'https://img.example/video.jpg' } },
          },
          contentDetails: { videoPublishedAt: '2026-11-13T10:00:00Z' },
        }],
        nextPageToken: 'next-page-token',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', providerFetch);
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/youtube/feed`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        env: {
          DB: mockDb({ savedChannels: [{ channelId: 'UCabc123', title: 'Example creator', thumbnailUrl: null, uploadPlaylistId: 'UUabc123' }] }),
          YOUTUBE_DATA_API_KEY: 'worker-test-key',
        },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(200);
      expect(ctx.jsonBody).toMatchObject({
        success: true,
        data: { videos: [{ videoId: 'video123', channelId: 'UCabc123' }], channelsChecked: 1 },
      });
      expect(providerFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});


describe('YouTube Shorts label filtering', () => {
  it('filters explicit Shorts hashtags but keeps ordinary short-form titles', () => {
    expect(isMarkedYouTubeShort('#Shorts quick clip', '')).toBe(true);
    expect(isMarkedYouTubeShort('A creator update', 'Watch more #YouTubeShorts here')).toBe(true);
    expect(isMarkedYouTubeShort('A short tutorial', 'This video explains the short story format.')).toBe(false);
  });
});

describe('Kairo-curated YouTube API quota protection', () => {
  it('throttles repeated channel searches before calling YouTube', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/channels/search');
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/youtube/channels/search?q=creators`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        env: {
          DB: mockDb({ youtubeRateLimitAttempts: 6 }),
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
          YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
          YOUTUBE_DATA_API_KEY: 'worker-test-key',
        },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(429);
      expect(ctx.jsonBody).toMatchObject({ error: { code: 'RATE_LIMITED' } });
      expect(providerFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('throttles excessive feed page requests', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/feed');
    const ctx = makeContext({
      url: `${canonicalOrigin}/api/v1/youtube/feed`,
      cookie: `kairo_session=${'a'.repeat(43)}`,
      env: { DB: mockDb({ youtubeRateLimitAttempts: 31 }) },
    });
    const response = await handler(ctx.context);
    expect(response.status).toBe(429);
    expect(ctx.jsonBody).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });
});


describe('Kairo YouTube shared quota budgets', () => {
  it('reserves headroom under the project-wide daily channel-search allowance', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/channels/search');
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/youtube/channels/search?q=creators`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        env: {
          DB: mockDb({ youtubeGlobalRateLimitAttempts: 81 }),
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
          YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
          YOUTUBE_DATA_API_KEY: 'worker-test-key',
        },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(429);
      expect(ctx.jsonBody).toMatchObject({ error: { code: 'RATE_LIMITED' } });
      expect(providerFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
