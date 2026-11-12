import { describe, expect, it, vi } from 'vitest';
import { registerGoogleAuthRoutes } from './google';
import { registerYouTubeAuthRoutes } from './youtube';

type RouteHandler = (context: any) => Promise<Response>;

function routeFor(register: (app: any) => void, path: string): RouteHandler {
  const routes = new Map<string, RouteHandler>();
  register({
    get: (route: string, handler: RouteHandler) => routes.set(route, handler),
    post: () => {},
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

function mockDb(options: { authenticated?: boolean; failYoutubeStateInsert?: boolean } = {}): D1Database {
  const authenticated = options.authenticated ?? true;
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
          if (sql.includes('FROM sessions s') && sql.includes('INNER JOIN user_profiles')) {
            return authenticated ? {
              userId: 'user-123',
              displayName: 'Kairo tester',
              email: 'tester@example.com',
              emailVerifiedAt: null,
              role: 'user',
            } : null;
          }
          if (sql.includes('SELECT id FROM sessions')) return authenticated ? { id: 'session-123' } : null;
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
