import { afterEach, describe, expect, it } from 'vitest';
import { hashPassword } from './password';
import { registerAuthRoutes } from './routes';

afterEach(() => {});

function registeredRoutes() {
  const routes = new Map<string, (context: any) => Promise<Response>>();
  registerAuthRoutes({
    get: (route: string, handler: any) => routes.set(`GET ${route}`, handler),
    post: (route: string, handler: any) => routes.set(`POST ${route}`, handler),
    delete: (route: string, handler: any) => routes.set(`DELETE ${route}`, handler),
    use: () => undefined,
  } as any);
  return routes;
}

function context(body: unknown, db: D1Database) {
  const headers = new Map<string, string>();
  const requestHeaders: Record<string, string> = {
    origin: 'https://kairo-anime-platform-staging.unpainllama.workers.dev',
    'user-agent': 'Kairo auth tests',
    'cf-connecting-ip': '192.0.2.10',
  };
  return {
    env: { DB: db },
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

function mockDb(account: { role: string; passwordHash: string; userId?: string }) {
  const calls: string[] = [];
  const db = {
    prepare(sql: string) {
      calls.push(sql);
      return {
        bind: (..._values: unknown[]) => ({
          first: async () => {
            if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
            if (sql.includes('SELECT p.id userId')) return {
              userId: account.userId ?? 'test-user',
              accountStatus: 'active',
              role: account.role,
              identityId: 'test-identity',
              passwordHash: account.passwordHash,
            };
            return null;
          },
          run: async () => ({ success: true, meta: { changes: 1 } }),
        }),
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe('closed-access authentication', () => {
  it('does not register public registration, Google sign-in, or email-code login routes', () => {
    const routes = registeredRoutes();
    expect(routes.has('POST /api/v1/auth/register')).toBe(false);
    expect(routes.has('GET /api/v1/auth/google')).toBe(false);
    expect(routes.has('POST /api/v1/auth/admin-code/verify')).toBe(false);
  });

  it('signs in a standard account with a username and password', async () => {
    const passwordHash = await hashPassword('correct-horse-battery-staple');
    const { db, calls } = mockDb({ role: 'user', passwordHash });
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    const ctx = context({ username: 'KairoTester', password: 'correct-horse-battery-staple' }, db);
    const response = await handler!(ctx);
    const payload = await response.json() as { success: boolean; data?: { signedIn?: boolean; administrator?: boolean } };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ success: true, data: { signedIn: true, administrator: false } });
    expect(calls.some(sql => sql.includes('WHERE p.username=? COLLATE NOCASE'))).toBe(true);
    expect(calls.some(sql => sql.includes('INSERT INTO sessions'))).toBe(true);
    expect(ctx.responseHeaders.get('set-cookie')).toMatch(/^kairo_session=[A-Za-z0-9_-]{43};/);
    expect(ctx.responseHeaders.get('set-cookie')).toContain('Max-Age=2592000');
  });

  it('signs in the administrator with the one-time-provisioned password and an eight-hour session', async () => {
    const passwordHash = await hashPassword('a-very-long-admin-password');
    const { db, calls } = mockDb({ role: 'admin', passwordHash, userId: 'admin-user' });
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    const ctx = context({ username: 'KairoAdmin', password: 'a-very-long-admin-password' }, db);
    const response = await handler!(ctx);
    const payload = await response.json() as { success: boolean; data?: { signedIn?: boolean; administrator?: boolean } };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ success: true, data: { signedIn: true, administrator: true } });
    expect(calls.some(sql => sql.includes('INSERT INTO sessions'))).toBe(true);
    expect(ctx.responseHeaders.get('set-cookie')).toContain('Max-Age=28800');
  });

  it('rejects username-only login for standard and administrator accounts', async () => {
    for (const role of ['user', 'admin']) {
      const { db, calls } = mockDb({ role, passwordHash: 'unused' });
      const handler = registeredRoutes().get('POST /api/v1/auth/login');
      const response = await handler!(context({ username: 'KairoAccount', password: '' }, db));
      expect(response.status).toBe(401);
      expect(calls.some(sql => sql.includes('INSERT INTO sessions'))).toBe(false);
    }
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
