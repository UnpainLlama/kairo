-- Administrator email one-time codes and 30-minute private console paths.
CREATE TABLE IF NOT EXISTS admin_login_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_admin_login_challenges_user
  ON admin_login_challenges(user_id, expires_at);

CREATE TABLE IF NOT EXISTS admin_console_access (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  path_value TEXT NOT NULL,
  rotated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
