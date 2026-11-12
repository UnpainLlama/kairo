-- Short-lived, one-time Google OAuth transactions. PKCE verifier remains server-side.
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  link_user_id TEXT REFERENCES user_profiles(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_google_oauth_states_expiry ON google_oauth_states(expires_at);
