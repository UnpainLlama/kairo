import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migrationFiles = [
  '0001_initial_schema.sql',
  '0002_provider_architecture.sql',
  '0003_accounts.sql',
  '0004_auth_rate_limits.sql',
  '0005_google_oauth.sql',
  '0006_watch_history.sql',
  '0007_youtube_oauth.sql',
  '0008_youtube_feed_channels.sql',
  '0009_youtube_feed_cursors.sql',
  '0010_youtube_upload_playlists.sql',
  '0011_youtube_media_library.sql',
  '0012_movies_catalogue.sql',
  '0013_unified_media_sync.sql',
  '0014_user_media_playback.sql',
  '0015_closed_access_usernames.sql',
  '0016_playback_write_order.sql',
  '0017_admin_email_otp_console_rotation.sql',
  '0018_cloudflare_access_identity_admin_lockout.sql',
];

function applyMigrations(db: DatabaseSync, from = 0, to = migrationFiles.length): void {
  for (const file of migrationFiles.slice(from, to)) {
    db.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
}

function addProfile(
  db: DatabaseSync,
  values: { id: string; username: string; accessEmail: string; role?: 'user' | 'admin' },
): void {
  db.prepare(`INSERT INTO user_profiles
    (id, identity_subject, display_name, username, access_email, account_status, role)
    VALUES (?, ?, ?, ?, ?, 'active', ?)`)
    .run(values.id, `subject:${values.id}`, values.id, values.username, values.accessEmail, values.role ?? 'user');
}

describe('closed-access D1 migrations', () => {
  it('applies all migrations and enforces unique Access email, one admin and 15 standard accounts', () => {
    const db = new DatabaseSync(':memory:');
    try {
      applyMigrations(db);
      const securityState = db.prepare(
        'SELECT admin_bootstrap_completed_at AS completedAt FROM app_security_state WHERE singleton_id=1',
      ).get() as { completedAt: number | null };
      const loginState = db.prepare(
        'SELECT failed_attempts AS failedAttempts, locked_at AS lockedAt FROM admin_login_security WHERE singleton_id=1',
      ).get() as { failedAttempts: number; lockedAt: number | null };
      expect(securityState.completedAt).toBeNull();
      expect(loginState).toEqual({ failedAttempts: 0, lockedAt: null });

      for (let i = 1; i <= 15; i += 1) {
        addProfile(db, {
          id: `standard-${i}`,
          username: `standard${i}`,
          accessEmail: `standard${i}@example.test`,
        });
      }
      expect(() => addProfile(db, {
        id: 'standard-16',
        username: 'standard16',
        accessEmail: 'standard16@example.test',
      })).toThrow();

      expect(() => addProfile(db, {
        id: 'duplicate-access-email',
        username: 'different-user',
        accessEmail: 'STANDARD1@example.test',
      })).toThrow();

      addProfile(db, {
        id: 'kairo-admin',
        username: 'kairoadmin',
        accessEmail: 'admin@example.test',
        role: 'admin',
      });
      expect(() => addProfile(db, {
        id: 'second-admin',
        username: 'secondadmin',
        accessEmail: 'second-admin@example.test',
        role: 'admin',
      })).toThrow();

      const count = db.prepare("SELECT COUNT(*) AS total FROM user_profiles WHERE role='user'").get() as { total: number };
      expect(count.total).toBe(15);
    } finally {
      db.close();
    }
  });

  it('permanently closes administrator bootstrap when an administrator already exists at migration time', () => {
    const db = new DatabaseSync(':memory:');
    try {
      applyMigrations(db, 0, 14);
      db.prepare(`INSERT INTO user_profiles (id, identity_subject, display_name, role)
        VALUES ('legacy-admin', 'legacy-admin-subject', 'Legacy Administrator', 'admin')`).run();
      applyMigrations(db, 14, migrationFiles.length);

      const state = db.prepare(
        'SELECT admin_bootstrap_completed_at AS completedAt FROM app_security_state WHERE singleton_id=1',
      ).get() as { completedAt: number | null };
      const legacy = db.prepare(
        'SELECT username FROM user_profiles WHERE id=\'legacy-admin\'',
      ).get() as { username: string };

      expect(state.completedAt).toBeTypeOf('number');
      expect(state.completedAt).toBeGreaterThan(0);
      expect(legacy.username).toBe('user_legacyadmin');
    } finally {
      db.close();
    }
  });
});
