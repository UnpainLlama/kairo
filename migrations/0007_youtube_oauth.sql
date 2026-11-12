-- Short-lived, one-time YouTube OAuth transactions bound to the initiating Kairo session.
CREATE TABLE IF NOT EXISTS youtube_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_youtube_oauth_states_expiry ON youtube_oauth_states(expires_at);
