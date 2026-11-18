import { describe, expect, it } from 'vitest';
import { hashPassword } from './password';
import { registerAuthRoutes } from './routes';

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

function context(body: unknown, db: D1Database, origin: string | null = 'https://kairo-anime-platform-staging.unpainllama.workers.dev') {
  const headers = new Map<string, string>();
  const requestHeaders: Record<string, string> = {
    'user-agent': 'Kairo auth tests',
    'cf-connecting-ip': '192.0.2.10',
  };
  if (origin) requestHeaders.origin = origin;
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
      const first = async () => {
        if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
        if (sql.includes('SELECT p.id userId')) return {
          userId: account.userId ?? 'test-user',
          accountStatus: 'active',
          role: account.role,
          identityId: 'test-identity',
          passwordHash: account.passwordHash,
          accessEmail: null,
        };
        if (sql.includes('SELECT locked_at AS lockedAt')) return { lockedAt: null };
        return null;
      };
      return {
        first,
        bind: (..._values: unknown[]) => ({
          first,
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

  it('rejects login POSTs without a same-origin Origin or Referer before querying credentials', async () => {
    const { db, calls } = mockDb({ role: 'user', passwordHash: 'unused' });
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    const missing = await handler!(context({ username: 'KairoTester', password: 'some-long-password-here' }, db, null));
    const foreign = await handler!(context({ username: 'KairoTester', password: 'some-long-password-here' }, db, 'https://attacker.example'));
    expect(missing.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(calls).toHaveLength(0);
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
  it('locks the administrator after five wrong passwords within one hour until manual Cloudflare reset', async () => {
    const passwordHash = await hashPassword('the-correct-administrator-password');
    let failedAttempts = 0;
    let lockedAt: number | null = null;
    let sessionsRevoked = false;
    const db = {
      prepare(sql: string) {
        const first = async () => {
          if (sql.includes('SELECT locked_at AS lockedAt')) return { lockedAt };
          return null;
        };
        return {
          first,
          run: async () => {
            if (sql.includes('DELETE FROM sessions WHERE user_id IN')) sessionsRevoked = true;
            return { success: true, meta: { changes: 1 } };
          },
          bind: (..._values: unknown[]) => ({
            first: async () => {
              if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
              if (sql.includes('SELECT p.id userId')) return {
                userId: 'admin-user', accountStatus: 'active', role: 'admin',
                identityId: 'admin-identity', passwordHash, accessEmail: null,
              };
              if (sql.includes('SELECT locked_at AS lockedAt')) return { lockedAt };
              if (sql.includes('INSERT INTO admin_login_security')) {
                if (lockedAt !== null) return null;
                failedAttempts += 1;
                if (failedAttempts >= 5) lockedAt = Date.now();
                return { failedAttempts, lockedAt };
              }
              return null;
            },
            run: async () => {
              if (sql.includes('DELETE FROM sessions WHERE user_id IN')) sessionsRevoked = true;
              return { success: true, meta: { changes: 1 } };
            },
          }),
        };
      },
    } as unknown as D1Database;
    const handler = registeredRoutes().get('POST /api/v1/auth/login');
    for (let attempt = 1; attempt < 5; attempt += 1) {
      const response = await handler!(context({ username: 'KairoAdmin', password: 'wrong-password' }, db));
      expect(response.status).toBe(401);
    }
    const fifth = await handler!(context({ username: 'KairoAdmin', password: 'wrong-password' }, db));
    expect(fifth.status).toBe(423);
    const sixth = await handler!(context({ username: 'KairoAdmin', password: 'wrong-password' }, db));
    expect(sixth.status).toBe(423);
    expect(failedAttempts).toBe(5);
    expect(lockedAt).not.toBeNull();
    expect(sessionsRevoked).toBe(true);
  });

});
