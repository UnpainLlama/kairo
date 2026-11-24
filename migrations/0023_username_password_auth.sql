-- Local username/password credentials. Existing profile IDs and account-owned rows remain intact.
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  must_change_password INTEGER NOT NULL DEFAULT 0
    CHECK (must_change_password IN (0, 1))
);
