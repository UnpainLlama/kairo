import { describe, expect, it } from 'vitest';
import { rotateAdminConsolePath } from './routes';

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
