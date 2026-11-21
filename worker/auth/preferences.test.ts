// @ts-ignore Node 22 built-in SQLite is used by Vitest integration tests, not Worker runtime code.
import { DatabaseSync } from 'node:sqlite';
// @ts-ignore Node's fs API is used only to apply real SQL migrations in the test harness.
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerHistoryPreferenceRoutes } from './preferences';
import { hashToken } from './session';

const migrationFiles = [
  '0001_initial_schema.sql', '0002_provider_architecture.sql', '0003_accounts.sql',
  '0004_auth_rate_limits.sql', '0005_google_oauth.sql', '0006_watch_history.sql',
  '0007_youtube_oauth.sql', '0008_youtube_feed_channels.sql', '0009_youtube_feed_cursors.sql',
  '0010_youtube_upload_playlists.sql', '0011_youtube_media_library.sql', '0012_movies_catalogue.sql',
  '0013_unified_media_sync.sql', '0014_user_media_playback.sql', '0015_closed_access_usernames.sql',
  '0016_playback_write_order.sql', '0017_admin_email_otp_console_rotation.sql',
  '0018_cloudflare_access_identity_admin_lockout.sql', '0019_session_privacy_retention.sql',
  '0020_cloudflare_access_subject_binding.sql', '0021_reassignable_account_seats.sql',
  '0022_account_history_pause_preference.sql',
];

function applyMigrations(db: DatabaseSync): void {
  for (const file of migrationFiles) db.exec(readFileSync('migrations/' + file, 'utf8'));
}

function sqliteD1(db: DatabaseSync): D1Database {
  const statement = (sql: string, values: unknown[] = []) => ({
    bind: (...bound: unknown[]) => statement(sql, bound),
    first: async () => db.prepare(sql).get(...(values as never[])) ?? null,
    run: async () => {
      const result = db.prepare(sql).run(...(values as never[]));
      return { success: true, meta: { changes: Number(result.changes) } };
    },
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

async function createPreferencesApp() {
  const db = new DatabaseSync(':memory:');
  applyMigrations(db);
  const token = 'a'.repeat(43);
  db.prepare(`
    INSERT INTO user_profiles
      (id, identity_subject, display_name, email, access_email, access_subject, account_status, role, username)
    VALUES ('account-1', 'identity-1', 'Test user', 'test@example.test',
            'test@example.test', 'access-subject-1', 'active', 'user', 'testuser')
  `).run();
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES ('session-1', 'account-1', ?, ?)
  `).run(await hashToken(token), Date.now() + 60 * 60 * 1000);

  const app = new Hono();
  registerHistoryPreferenceRoutes(app as never);
  return { db, app, token, env: { DB: sqliteD1(db) } };
}

describe('account-wide history pause preference', () => {
  it('defaults to recording, then persists pause and resume for the same account', async () => {
    const { db, app, token, env } = await createPreferencesApp();
    try {
      const headers = { Cookie: 'kairo_session=' + token, Accept: 'application/json' };
      const initial = await app.request('https://kairo.test/api/v1/me/preferences', { headers }, env);
      expect(initial.status).toBe(200);
      expect((await initial.json() as any).data.historyPaused).toBe(false);

      const pause = await app.request('https://kairo.test/api/v1/me/preferences', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json', Origin: 'https://kairo.test' },
        body: JSON.stringify({ historyPaused: true }),
      }, env);
      expect(pause.status).toBe(200);
      expect((await pause.json() as any).data.historyPaused).toBe(true);

      const restored = await app.request('https://kairo.test/api/v1/me/preferences', { headers }, env);
      expect((await restored.json() as any).data.historyPaused).toBe(true);

      const resume = await app.request('https://kairo.test/api/v1/me/preferences', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json', Origin: 'https://kairo.test' },
        body: JSON.stringify({ historyPaused: false }),
      }, env);
      expect(resume.status).toBe(200);
      expect((await resume.json() as any).data.historyPaused).toBe(false);
    } finally {
      db.close();
    }
  });

  it('rejects invalid preference shapes and cross-origin writes', async () => {
    const { db, app, token, env } = await createPreferencesApp();
    try {
      const headers = { Cookie: 'kairo_session=' + token, 'Content-Type': 'application/json' };
      const invalid = await app.request('https://kairo.test/api/v1/me/preferences', {
        method: 'PUT', headers, body: JSON.stringify({ historyPaused: 'true' }),
      }, env);
      expect(invalid.status).toBe(400);

      const crossOrigin = await app.request('https://kairo.test/api/v1/me/preferences', {
        method: 'PUT',
        headers: { ...headers, Origin: 'https://attacker.test' },
        body: JSON.stringify({ historyPaused: true }),
      }, env);
      expect(crossOrigin.status).toBe(403);
    } finally {
      db.close();
    }
  });
});
