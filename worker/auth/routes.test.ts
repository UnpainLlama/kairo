import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from './password';
import { registerAuthRoutes } from './routes';

type Handler = (context: any) => Promise<Response>;

afterEach(() => vi.unstubAllGlobals());

function registeredRoutes() {
  const routes = new Map<string, Handler>();
  registerAuthRoutes({
    get: (route: string, handler: Handler) => routes.set(`GET ${route}`, handler),
    post: (route: string, handler: Handler) => routes.set(`POST ${route}`, handler),
    delete: (route: string, handler: Handler) => routes.set(`DELETE ${route}`, handler),
    use: () => undefined,
  } as any);
  return routes;
}

function context(body: unknown, db: D1Database, envExtras: Record<string, unknown> = {}) {
  const headers = new Map<string, string>();
  const requestHeaders: Record<string, string> = {
    origin: 'https://kairo-anime-platform-staging.unpainllama.workers.dev',
    'user-agent': 'Kairo auth tests',
    'cf-connecting-ip': '192.0.2.10',
  };
  return {
    env: { DB: db, ...envExtras },
    req: {
      url: 'https://kairo-anime-platform-staging.unpainllama.workers.dev/api/v1/auth/login',
      json: async () => body,
      header: (name: string) => requestHeaders[name.toLowerCase()],
    },
    header: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
      status, headers: { 'Content-Type': 'application/json' },
    }),
    get: (name: string) => name === 'requestId' ? 'auth-test-request' : undefined,
    responseHeaders: headers,
  };
}

describe('closed-access authentication', () => {
  it('does not register a public account-creation endpoint or Google sign-in route', () => {
    const routes = registeredRoutes();
    expect(routes.has('POST /api/v1/auth/register')).toBe(false);
    expect(routes.has('GET /api/v1/auth/google')).toBe(false);
    expect(routes.has('POST /api/v1/auth/admin-code/verify')).toBe(true);
  });

  it('signs in with a username and password', async () => {
    const passwordHash = await hashPassword('correct-horse-battery-staple');
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            calls.push({ sql, values });
            return {
              first: async () => {
                if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
                if (sql.includes('SELECT p.id userId')) return {
                  userId: 'user-123', accountStatus: 'active', role: 'user', identityId: 'identity-123', passwordHash,
                };
                return null;
              },
              run: async () => ({ success: true, meta: { changes: 1 } }),
            };
          },
        };
      },
    } as unknown as D1Database;
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    expect(handler).toBeDefined();
    const ctx = context({ username: 'KairoTester', password: 'correct-horse-battery-staple' }, db);
    const response = await handler!(ctx);
    const payload = await response.json() as { success: boolean; data?: { signedIn?: boolean } };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ success: true, data: { signedIn: true } });
    expect(calls.some(call => call.sql.includes('WHERE p.username=? COLLATE NOCASE'))).toBe(true);
    expect(calls.some(call => call.sql.includes('INSERT INTO sessions'))).toBe(true);
    expect(ctx.responseHeaders.get('set-cookie')).toMatch(/^kairo_session=[A-Za-z0-9_-]{43};/);
    expect(ctx.responseHeaders.get('set-cookie')).toContain('Max-Age=2592000');
  });

  it('rejects a standard account username-only login without creating a session', async () => {
    const calls: string[] = [];
    const db = {
      prepare(sql: string) {
        calls.push(sql);
        return {
          bind: () => ({
            first: async () => {
              if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
              if (sql.includes('SELECT p.id userId')) return {
                userId: 'user-standard', accountStatus: 'active', role: 'user',
                identityId: 'identity-standard', passwordHash: 'unused',
              };
              return null;
            },
            run: async () => ({ success: true, meta: { changes: 1 } }),
          }),
        };
      },
    } as unknown as D1Database;
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    const response = await handler!(context({ username: 'StandardUser', password: '' }, db));
    expect(response.status).toBe(401);
    expect(calls.some(sql => sql.includes('INSERT INTO sessions'))).toBe(false);
  });

  it('does not allow the administrator password to bypass email verification', async () => {
    const db = {
      prepare(sql: string) {
        return {
          bind: () => ({
            first: async () => {
              if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
              if (sql.includes('SELECT p.id userId')) return {
                userId: 'user-admin', accountStatus: 'active', role: 'admin',
                identityId: 'identity-admin', passwordHash: null,
              };
              return null;
            },
            run: async () => ({ success: true, meta: { changes: 1 } }),
          }),
        };
      },
    } as unknown as D1Database;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    const response = await handler!(context({ username: 'KairoAdmin', password: 'old-admin-password' }, db));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts an administrator email-code challenge when the password is blank', async () => {
    const calls: string[] = [];
    const db = {
      prepare(sql: string) {
        calls.push(sql);
        return {
          bind: () => ({
            first: async () => {
              if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
              if (sql.includes('SELECT p.id userId')) return {
                userId: 'user-admin', accountStatus: 'active', role: 'admin',
                identityId: 'identity-admin', passwordHash: null,
              };
              return null;
            },
            run: async () => ({ success: true, meta: { changes: 1 } }),
          }),
        };
      },
      batch: async () => [{ success: true }, { success: true }],
    } as unknown as D1Database;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    const response = await handler!(context(
      { username: 'KairoAdmin', password: '' },
      db,
      { ADMIN_EMAIL: 'admin@example.test', ADMIN_OTP_PEPPER: 'a'.repeat(43), RESEND_API_KEY: 're_test_key_1234567890' },
    ));
    const payload = await response.json() as { success: boolean; data?: { challengeRequired?: boolean; challengeId?: string } };
    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ success: true, data: { challengeRequired: true } });
    expect(typeof payload.data?.challengeId).toBe('string');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls.some(sql => sql.includes('INSERT INTO sessions'))).toBe(false);
  });

  it('consumes a valid administrator email code exactly once and creates a session', async () => {
    const challengeId = 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab';
    const code = '01234567';
    const pepper = 'b'.repeat(43);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(challengeId + ':' + code));
    const codeHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    const calls: string[] = [];
    const db = {
      prepare(sql: string) {
        calls.push(sql);
        return {
          bind: () => ({
            first: async () => {
              if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
              if (sql.includes('SELECT ch.user_id')) return {
                userId: 'user-admin', codeHash, expiresAt: Date.now() + 300_000, attempts: 0,
              };
              if (sql.includes('UPDATE admin_login_challenges SET consumed_at')) return { user_id: 'user-admin' };
              return null;
            },
            run: async () => ({ success: true, meta: { changes: 1 } }),
          }),
        };
      },
    } as unknown as D1Database;
    const handler = registeredRoutes().get('POST /api/v1/auth/admin-code/verify');
    const ctx = context({ username: 'KairoAdmin', challengeId, code }, db, { ADMIN_OTP_PEPPER: pepper });
    const response = await handler!(ctx);
    const payload = await response.json() as { success: boolean; data?: { signedIn?: boolean; administrator?: boolean } };
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ success: true, data: { signedIn: true, administrator: true } });
    expect(calls.some(sql => sql.includes('UPDATE admin_login_challenges SET consumed_at'))).toBe(true);
    expect(calls.some(sql => sql.includes('INSERT INTO sessions'))).toBe(true);
    expect(ctx.responseHeaders.get('set-cookie')).toMatch(/^kairo_session=[A-Za-z0-9_-]{43};/);
    expect(ctx.responseHeaders.get('set-cookie')).toContain('Max-Age=28800');
  });

  it('rejects malformed usernames before querying the account table', async () => {
    const calls: string[] = [];
    const db = {
      prepare(sql: string) {
        calls.push(sql);
        return { bind: () => ({ first: async () => ({ attempts: 1 }), run: async () => ({}) }) };
      },
    } as unknown as D1Database;
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    const response = await handler!(context({ username: 'not a valid username', password: 'long-enough-password' }, db));
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
