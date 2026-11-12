import { describe, expect, it, vi } from 'vitest';
import { registerGoogleAuthRoutes } from './google';
import { registerYouTubeAuthRoutes } from './youtube';

type RouteHandler = (context: any) => Promise<Response>;

function routeFor(register: (app: any) => void, path: string): RouteHandler {
  const routes = new Map<string, RouteHandler>();
  register({
    get: (route: string, handler: RouteHandler) => routes.set(route, handler),
    post: () => {},
    delete: () => {},
  });
  const handler = routes.get(path);
  if (!handler) throw new Error(`Route not registered: ${path}`);
  return handler;
}

function makeContext(options: {
  url: string;
  env: Record<string, unknown>;
  cookie?: string;
}) {
  const responseHeaders = new Map<string, string[]>();
  let redirectedTo: string | null = null;
  let jsonBody: unknown = null;

  const context = {
    env: options.env,
    get: (name: string) => name === 'requestId' ? 'test-request-id' : undefined,
    req: {
      url: options.url,
      header: (name: string) => name.toLowerCase() === 'cookie' ? options.cookie : undefined,
      query: (name: string) => new URL(options.url).searchParams.get(name) ?? undefined,
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

function mockDb(options: { authenticated?: boolean; recentSession?: boolean; failYoutubeStateInsert?: boolean; youtubeRateLimitAttempts?: number; youtubeGlobalRateLimitAttempts?: number } = {}): D1Database {
  const authenticated = options.authenticated ?? true;
  let youtubeRateLimitReads = 0;
  const db = {
    prepare: (sql: string) => ({
      bind: (..._values: unknown[]) => ({
        run: async () => {
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
        all: async () => ({ results: [] }),
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

  it('requires a YouTube connection without calling the provider API', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/channels/search');
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);
    try {
      const ctx = makeContext({
        url: `${canonicalOrigin}/api/v1/youtube/channels/search?q=creator`,
        cookie: `kairo_session=${'a'.repeat(43)}`,
        env: {
          DB: mockDb(),
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
          YOUTUBE_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
        },
      });
      const response = await handler(ctx.context);
      expect(response.status).toBe(403);
      expect(ctx.jsonBody).toMatchObject({ error: { code: 'YOUTUBE_NOT_CONNECTED' } });
      expect(providerFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('throttles repeated feed refreshes', async () => {
    const handler = routeFor(registerYouTubeAuthRoutes, '/api/v1/youtube/feed');
    const ctx = makeContext({
      url: `${canonicalOrigin}/api/v1/youtube/feed`,
      cookie: `kairo_session=${'a'.repeat(43)}`,
      env: { DB: mockDb({ youtubeRateLimitAttempts: 11 }) },
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
