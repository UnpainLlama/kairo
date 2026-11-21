import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerAdminRoutes, rotateAdminConsolePath } from './routes';

describe('administrator console path rotation', () => {
  it('generates a 256-bit base64url path only when an active admin exists', async () => {
    let insertedPath = '';
    let writes = 0;
    const db = {
      prepare(sql: string) {
        if (sql.includes('SELECT id FROM user_profiles')) {
          return { first: async () => ({ id: 'admin-user' }) };
        }
        return {
          bind: (...values: unknown[]) => ({
            run: async () => {
              writes += 1;
              insertedPath = String(values[0] ?? '');
              return { success: true, meta: { changes: 1 } };
            },
          }),
        };
      },
    } as unknown as D1Database;

    await rotateAdminConsolePath(db);

    expect(writes).toBe(1);
    expect(insertedPath).toMatch(/^\/[A-Za-z0-9_-]{43}$/);
  });

  it('does not invalidate an unexpired console route during scheduled maintenance', async () => {
    let upsertSql = '';
    let values: unknown[] = [];
    const db = {
      prepare(sql: string) {
        if (sql.includes("SELECT id FROM user_profiles")) {
          return { first: async () => ({ id: 'admin-user' }) };
        }
        return {
          bind: (...bound: unknown[]) => {
            values = bound;
            return {
              run: async () => {
                upsertSql = sql;
                return { success: true, meta: { changes: 0 } };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    await rotateAdminConsolePath(db);

    expect(upsertSql).toContain('WHERE admin_console_access.expires_at <= ?');
    expect(values).toHaveLength(4);
    expect(values[0]).toMatch(/^\/[A-Za-z0-9_-]{43}$/);
    expect(values[3]).toBe(values[1]);
  });

  it('does not create a console path if no active administrator exists', async () => {
    let writes = 0;
    const db = {
      prepare: () => ({
        first: async () => null,
        bind: () => ({ run: async () => { writes += 1; return { success: true }; } }),
      }),
    } as unknown as D1Database;

    await rotateAdminConsolePath(db);
    expect(writes).toBe(0);
  });
});


describe('retired password-based admin endpoint', () => {
  it('returns 410 without touching account storage or creating credentials', async () => {
    let databaseCalls = 0;
    const app = new Hono();
    registerAdminRoutes(app as never);
    const response = await app.request('/api/v1/admin/accounts/user-123/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'not-a-real-password' }),
    }, {
      DB: {
        prepare() {
          databaseCalls += 1;
          throw new Error('retired password endpoint must not touch storage');
        },
      },
    } as never);
    const payload = await response.json() as { success: boolean; error: { code: string } };

    expect(response.status).toBe(410);
    expect(payload).toMatchObject({ success: false, error: { code: 'ACCESS_SIGN_IN_ONLY' } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(databaseCalls).toBe(0);
  });
});
