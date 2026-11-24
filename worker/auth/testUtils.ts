// @ts-ignore Node 22 built-in SQLite is used only by Vitest integration tests.
import { DatabaseSync } from 'node:sqlite';
// @ts-ignore Test harness reads repository migration files from disk.
import { readFileSync } from 'node:fs';

export const migrationFiles = [
  '0001_initial_schema.sql','0002_provider_architecture.sql','0003_accounts.sql',
  '0004_auth_rate_limits.sql','0005_google_oauth.sql','0006_watch_history.sql',
  '0007_youtube_oauth.sql','0008_youtube_feed_channels.sql','0009_youtube_feed_cursors.sql',
  '0010_youtube_upload_playlists.sql','0011_youtube_media_library.sql','0012_movies_catalogue.sql',
  '0013_unified_media_sync.sql','0014_user_media_playback.sql','0015_closed_access_usernames.sql',
  '0016_playback_write_order.sql','0017_admin_email_otp_console_rotation.sql',
  '0018_cloudflare_access_identity_admin_lockout.sql','0019_session_privacy_retention.sql',
  '0020_cloudflare_access_subject_binding.sql','0021_reassignable_account_seats.sql',
  '0022_account_history_pause_preference.sql','0023_username_password_auth.sql',
  '0024_account_preference_subtitle_size.sql','0025_anime_library_provider_refs.sql',
  '0026_retire_legacy_anime_provider.sql',
] as const;

export function createTestDatabase(): any {
  const db = new DatabaseSync(':memory:');
  for (const file of migrationFiles) db.exec(readFileSync('migrations/' + file, 'utf8'));
  return db;
}

function statement(db: any, sql: string, values: unknown[] = []) {
  return {
    sql, values,
    bind: (...bound: unknown[]) => statement(db, sql, bound),
    first: async () => db.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...values) }),
    run: async () => {
      const result = db.prepare(sql).run(...values);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) || null } };
    },
  };
}

export function sqliteD1(db: any): D1Database {
  return {
    prepare: (sql: string) => statement(db, sql),
    batch: async (statements: any[]) => {
      db.exec('BEGIN');
      try {
        const results = statements.map((item) => {
          const result = db.prepare(item.sql).run(...item.values);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) || null } };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
}

export function insertTestProfile(db: any, input: {
  id: string; username: string; role?: 'user' | 'admin';
  status?: 'active' | 'suspended' | 'deleted'; displayName?: string;
}): void {
  db.prepare(`INSERT INTO user_profiles(id,identity_subject,display_name,username,account_status,role)
    VALUES(?,?,?,?,?,?)`).run(input.id, 'local:' + input.id, input.displayName ?? input.username,
    input.username, input.status ?? 'active', input.role ?? 'user');
}

export async function insertTestCredential(db: any, userId: string, password: string, mustChange = false): Promise<void> {
  const { hashPassword } = await import('./password');
  const hash = await hashPassword(password);
  db.prepare('INSERT INTO user_credentials(user_id,password_hash,must_change_password) VALUES(?,?,?)')
    .run(userId, hash, mustChange ? 1 : 0);
}

export async function createTestSession(db: any, userId: string, ttlSeconds = 60 * 60): Promise<{ token: string; cookie: string }> {
  const { createSession } = await import('./session');
  const session = await createSession(sqliteD1(db), userId, { ttlSeconds });
  return { token: session.token, cookie: 'kairo_session=' + session.token };
}
