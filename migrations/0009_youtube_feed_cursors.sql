-- Short-lived, user-owned cursors for paginating the Kairo YouTube feed.
CREATE TABLE IF NOT EXISTS youtube_feed_cursors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_youtube_feed_cursors_user_expiry
  ON youtube_feed_cursors(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_youtube_feed_cursors_expiry
  ON youtube_feed_cursors(expires_at);
