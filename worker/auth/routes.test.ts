import { describe, expect, it } from 'vitest';
import { registerAuthRoutes } from './routes';

type Handler = (context: any) => Promise<Response>;

function getHandler(method: string, path: string): Handler {
  const routes = new Map<string, Handler>();
  registerAuthRoutes({
    get: (route: string, handler: Handler) => routes.set(`GET ${route}`, handler),
    post: (route: string, handler: Handler) => routes.set(`POST ${route}`, handler),
  } as any);
  const handler = routes.get(`${method} ${path}`);
  if (!handler) throw new Error(`Route not registered: ${method} ${path}`);
  return handler;
}

function mockDb(options: { existingEmail?: boolean } = {}) {
  const batches: any[][] = [];
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return {
            first: async () => {
              if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 };
              if (sql.startsWith('SELECT id FROM user_profiles')) return options.existingEmail ? { id: 'existing-user' } : null;
              return null;
            },
            run: async () => ({ success: true, meta: { changes: 1 } }),
          };
        },
      };
    },
    batch: async (statements: any[]) => {
      batches.push(statements);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  return { db: db as unknown as D1Database, batches, calls };
}

function context(body: unknown, db: D1Database) {
  const headers = new Map<string, string>();
  return {
    env: { DB: db },
    req: {
      url: 'https://kairo-anime-platform-staging.unpainllama.workers.dev/api/v1/auth/register',
      json: async () => body,
      header: (name: string) => ({
        origin: 'https://kairo-anime-platform-staging.unpainllama.workers.dev',
        'user-agent': 'Kairo auth tests',
        'cf-connecting-ip': '192.0.2.10',
      }[name.toLowerCase()]),
    },
    header: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
    get: (name: string) => name === 'requestId' ? 'auth-test-request' : undefined,
    responseHeaders: headers,
  };
}

describe('email account registration', () => {
  it('creates a password credential and a session for a valid new account', async () => {
    const store = mockDb();
    const handler = getHandler('POST', '/api/v1/auth/register');
    const ctx = context({
      displayName: 'Kairo tester',
      email: 'Tester@example.com',
      password: 'correct-horse-battery-staple',
    }, store.db);

    const response = await handler(ctx);
    const payload = await response.json() as { success: boolean; data?: { signedIn?: boolean } };

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({ success: true, data: { signedIn: true } });
    expect(store.batches).toHaveLength(1);
    expect(store.batches[0]).toHaveLength(3);
    expect(store.calls.some((call) => call.sql.includes('INSERT INTO sessions'))).toBe(true);
    expect(ctx.responseHeaders.get('set-cookie')).toMatch(/^kairo_session=[A-Za-z0-9_-]{43};/);
  });

  it('explains the 12-character minimum through validation', async () => {
    const store = mockDb();
    const handler = getHandler('POST', '/api/v1/auth/register');
    const response = await handler(context({
      displayName: 'Kairo tester',
      email: 'tester@example.com',
      password: 'eight888',
    }, store.db));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(store.batches).toHaveLength(0);
  });

  it('does not create a second account for an email that already exists', async () => {
    const store = mockDb({ existingEmail: true });
    const handler = getHandler('POST', '/api/v1/auth/register');
    const response = await handler(context({
      displayName: 'Kairo tester',
      email: 'tester@example.com',
      password: 'correct-horse-battery-staple',
    }, store.db));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'EMAIL_ALREADY_REGISTERED' },
    });
    expect(store.batches).toHaveLength(0);
  });
});
