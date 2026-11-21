// @ts-ignore Node 22 built-in SQLite is used by Vitest integration tests, not Worker runtime code.
import { DatabaseSync } from 'node:sqlite';
// @ts-ignore Node's fs API is used only to apply real SQL migrations in the test harness.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reassignStandardAccountEmail } from '../admin/routes';
import { hasActiveAccessAccount } from './cloudflareAccess';

const migrations = [
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

function applyAll(db: DatabaseSync): void {
  for (const migration of migrations) db.exec(readFileSync('migrations/' + migration, 'utf8'));
}

function addProfile(db: DatabaseSync, id: string, email: string, subject: string | null = null): void {
  db.prepare("INSERT INTO user_profiles (id, identity_subject, display_name, username, email, access_email, access_subject, account_status, role) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'user')")
    .run(id, 'subject:' + id, id, 'username_' + id, email, email, subject);
}

type BoundSql = { sql: string; values: unknown[] };
function sqliteD1(db: DatabaseSync): D1Database {
  const makeStatement = (sql: string, values: unknown[] = []) => ({
    sql,
    values,
    bind: (...bound: unknown[]) => makeStatement(sql, bound),
    first: async () => db.prepare(sql).get(...(values as never[])) ?? null,
    run: async () => {
      const result = db.prepare(sql).run(...(values as never[]));
      return { success: true, meta: { changes: Number(result.changes) } };
    },
  });
  return {
    prepare: (sql: string) => makeStatement(sql),
    batch: async (statements: D1PreparedStatement[]) => {
      db.exec('BEGIN');
      try {
        const results = (statements as unknown as BoundSql[]).map(statement => {
          const result = db.prepare(statement.sql).run(...(statement.values as never[]));
          return { success: true, meta: { changes: Number(result.changes) } };
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

describe('standard-account seat reassignment privacy boundary', () => {
  it('creates a fresh profile, wipes all account-owned data and blocks the former Access identity', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      applyAll(db);
      const d1 = sqliteD1(db);
      addProfile(db, 'old-person', 'old.person@example.test', 'old-access-subject');
      for (let i = 2; i <= 15; i += 1) addProfile(db, 'standard-' + i, 'standard' + i + '@example.test');

      db.prepare("INSERT INTO user_preferences (user_id, theme) VALUES ('old-person', 'old-person-theme')").run();
      db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, access_email, access_subject) VALUES ('old-session', 'old-person', 'old-session-hash', 9999999999999, 'old.person@example.test', 'old-access-subject')").run();
      db.prepare("INSERT INTO user_watch_history (user_id, anime_slug, episode_number, title, updated_at) VALUES ('old-person', 'old-anime', 1, 'Old private anime', 1)").run();
      db.prepare("INSERT INTO youtube_watch_history (user_id, video_id, title, updated_at) VALUES ('old-person', 'abcdefghijk', 'Old private YouTube', 1)").run();
      db.prepare("INSERT INTO youtube_watch_later (user_id, video_id, title, saved_at) VALUES ('old-person', 'lmnopqrstuv', 'Old private watch later', 1)").run();
      db.prepare("INSERT INTO user_movie_library_refs (user_id, provider_id, external_id, status, is_favorite, added_at, updated_at) VALUES ('old-person', 'tmdb', '603', 'watchlist', 1, 1, 1)").run();
      db.prepare("INSERT INTO user_media_playback (user_id, media_type, media_key, title, updated_at) VALUES ('old-person', 'movie', '603', 'Old private movie', 1)").run();
      db.prepare("INSERT INTO youtube_feed_channels (user_id, channel_id, channel_title) VALUES ('old-person', 'UC1234567890123456789012', 'Old private channel')").run();
      db.prepare("INSERT INTO youtube_feed_cursors (id, user_id, state_json, expires_at) VALUES ('old-cursor', 'old-person', '{}', 9999999999999)").run();
      db.prepare("INSERT INTO provider_connections (id, user_id, provider) VALUES ('old-provider', 'old-person', 'youtube')").run();
      db.prepare("INSERT INTO google_oauth_states (state_hash, nonce, code_verifier, link_user_id, expires_at) VALUES ('old-google-state', 'nonce', 'verifier', 'old-person', 9999999999999)").run();
      db.prepare("INSERT INTO youtube_oauth_states (state_hash, user_id, session_hash, code_verifier, expires_at) VALUES ('old-youtube-state', 'old-person', 'session-hash', 'verifier', 9999999999999)").run();
      db.prepare("INSERT INTO user_watch_history_clear_markers (user_id, cleared_at) VALUES ('old-person', 1)").run();
      db.prepare("INSERT INTO user_watch_history_tombstones (user_id, anime_slug, episode_number, deleted_at) VALUES ('old-person', 'old-anime', 1, 1)").run();

      await expect(reassignStandardAccountEmail(d1, 'old-person', 'new.person@example.test')).resolves.toBe('reassigned');

      const old = db.prepare("SELECT display_name AS displayName, email, access_email AS accessEmail, access_subject AS accessSubject, username, account_status AS status FROM user_profiles WHERE id='old-person'").get() as Record<string, unknown>;
      expect(old).toMatchObject({
        displayName: 'Former account', email: null, accessEmail: 'old.person@example.test',
        accessSubject: 'old-access-subject', username: null, status: 'deleted',
      });
      const replacement = db.prepare("SELECT id, display_name AS displayName, email, access_email AS accessEmail, access_subject AS accessSubject, account_status AS status FROM user_profiles WHERE access_email='new.person@example.test'").get() as Record<string, unknown>;
      expect(replacement).toMatchObject({
        displayName: 'new person', email: 'new.person@example.test', accessEmail: 'new.person@example.test',
        accessSubject: null, status: 'active',
      });
      expect(replacement.id).not.toBe('old-person');

      const ownedTables = [
        'sessions', 'auth_identities', 'email_verification_tokens', 'password_reset_tokens',
        'provider_connections', 'youtube_oauth_states', 'user_preferences', 'user_library',
        'watch_progress', 'viewing_history', 'user_watch_history', 'youtube_feed_channels',
        'youtube_feed_cursors', 'youtube_watch_history', 'youtube_watch_later',
        'user_movie_library', 'user_movie_library_refs', 'user_watch_history_tombstones',
        'user_watch_history_clear_markers', 'user_media_playback',
      ];
      for (const table of ownedTables) {
        const row = db.prepare('SELECT COUNT(*) AS count FROM ' + table + " WHERE user_id='old-person'").get() as { count: number };
        expect(row.count, table).toBe(0);
      }
      const google = db.prepare("SELECT COUNT(*) AS count FROM google_oauth_states WHERE link_user_id='old-person'").get() as { count: number };
      expect(google.count).toBe(0);
      const activeCount = db.prepare("SELECT COUNT(*) AS count FROM user_profiles WHERE role='user' AND account_status IN ('active','suspended')").get() as { count: number };
      expect(activeCount.count).toBe(15);
      await expect(hasActiveAccessAccount(d1, 'old.person@example.test', 'old-access-subject')).resolves.toBe(false);
      await expect(hasActiveAccessAccount(d1, 'new.person@example.test', 'new-access-subject')).resolves.toBe(true);
    } finally {
      db.close();
    }
  });

  it('does not touch the original account when the requested email is already assigned', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      applyAll(db);
      const d1 = sqliteD1(db);
      addProfile(db, 'first', 'first@example.test');
      addProfile(db, 'second', 'second@example.test');
      db.prepare("INSERT INTO user_watch_history (user_id, anime_slug, episode_number, title, updated_at) VALUES ('first', 'private', 1, 'Keep this', 1)").run();

      await expect(reassignStandardAccountEmail(d1, 'first', 'second@example.test')).resolves.toBe('email-in-use');
      const account = db.prepare("SELECT account_status AS status FROM user_profiles WHERE id='first'").get() as { status: string };
      const history = db.prepare("SELECT title FROM user_watch_history WHERE user_id='first'").get() as { title: string };
      expect(account.status).toBe('active');
      expect(history.title).toBe('Keep this');
    } finally {
      db.close();
    }
  });
});
