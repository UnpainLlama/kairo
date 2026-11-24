// @ts-ignore Node 22 built-in SQLite is used by Vitest integration tests, not Worker runtime code.
import { DatabaseSync } from 'node:sqlite';
// @ts-ignore Node's fs API is used only to apply real SQL migrations in the test harness.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationFiles = [
  '0001_initial_schema.sql', '0002_provider_architecture.sql', '0003_accounts.sql',
  '0004_auth_rate_limits.sql', '0005_google_oauth.sql', '0006_watch_history.sql',
  '0007_youtube_oauth.sql', '0008_youtube_feed_channels.sql', '0009_youtube_feed_cursors.sql',
  '0010_youtube_upload_playlists.sql', '0011_youtube_media_library.sql', '0012_movies_catalogue.sql',
  '0013_unified_media_sync.sql', '0014_user_media_playback.sql', '0015_closed_access_usernames.sql',
  '0016_playback_write_order.sql', '0017_admin_email_otp_console_rotation.sql',
  '0018_cloudflare_access_identity_admin_lockout.sql', '0019_session_privacy_retention.sql',
  '0020_cloudflare_access_subject_binding.sql', '0021_reassignable_account_seats.sql',
  '0022_account_history_pause_preference.sql', '0023_username_password_auth.sql',
];

describe('username/password migration 0023', () => {
  it('applies after all 22 existing migrations without altering profile IDs or user-owned rows', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const file of migrationFiles) db.exec(readFileSync('migrations/' + file, 'utf8'));
      db.prepare(`INSERT INTO user_profiles (id,identity_subject,display_name,username,role)
        VALUES ('stable-profile-id','local:stable-profile-id','Existing member','member.one','user')`).run();
      db.prepare("INSERT INTO user_library (user_id,anime_id,status) VALUES ('stable-profile-id','unused-anime','watching')").run();

      db.prepare(`INSERT INTO user_credentials (user_id,password_hash,must_change_password)
        VALUES ('stable-profile-id','pbkdf2-sha256$v=2$i=100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',1)`).run();

      const profile = db.prepare("SELECT id,username FROM user_profiles WHERE id='stable-profile-id'").get();
      const credential = db.prepare("SELECT must_change_password FROM user_credentials WHERE user_id='stable-profile-id'").get();
      const library = db.prepare("SELECT user_id FROM user_library WHERE user_id='stable-profile-id'").get();
      expect(profile).toEqual({ id: 'stable-profile-id', username: 'member.one' });
      expect(credential).toEqual({ must_change_password: 1 });
      expect(library).toEqual({ user_id: 'stable-profile-id' });
    } finally {
      db.close();
    }
  });

  it('defaults must_change_password to false, checks the flag, and cascades on actual profile deletion', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const file of migrationFiles) db.exec(readFileSync('migrations/' + file, 'utf8'));
      db.prepare(`INSERT INTO user_profiles (id,identity_subject,display_name,username,role)
        VALUES ('profile-cascade','local:profile-cascade','Test member','test.member','user')`).run();
      db.prepare("INSERT INTO user_credentials (user_id,password_hash) VALUES ('profile-cascade','hash')").run();
      expect(db.prepare("SELECT must_change_password FROM user_credentials WHERE user_id='profile-cascade'").get())
        .toEqual({ must_change_password: 0 });
      expect(() => db.prepare("UPDATE user_credentials SET must_change_password=2 WHERE user_id='profile-cascade'").run()).toThrow();
      db.prepare("DELETE FROM user_profiles WHERE id='profile-cascade'").run();
      expect(db.prepare("SELECT COUNT(*) AS count FROM user_credentials WHERE user_id='profile-cascade'").get())
        .toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});
