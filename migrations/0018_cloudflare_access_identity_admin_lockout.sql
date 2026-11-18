-- Cloudflare Access email binding, permanent admin bootstrap completion, and manual admin lockout.
ALTER TABLE user_profiles ADD COLUMN access_email TEXT;
ALTER TABLE sessions ADD COLUMN access_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_access_email
  ON user_profiles(access_email COLLATE NOCASE)
  WHERE access_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_security_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  admin_bootstrap_completed_at INTEGER
);

INSERT OR IGNORE INTO app_security_state (singleton_id, admin_bootstrap_completed_at)
SELECT 1,
  CASE WHEN EXISTS (SELECT 1 FROM user_profiles WHERE role = 'admin')
    THEN CAST(strftime('%s', 'now') AS INTEGER) * 1000
    ELSE NULL
  END;

CREATE TABLE IF NOT EXISTS admin_login_security (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  window_started_at INTEGER NOT NULL DEFAULT 0,
  locked_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO admin_login_security (singleton_id, failed_attempts, window_started_at, locked_at, updated_at)
VALUES (1, 0, 0, NULL, 0);
