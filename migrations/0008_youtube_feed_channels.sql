-- Kairo's own per-user YouTube channel collection (independent of YouTube subscriptions).
CREATE TABLE IF NOT EXISTS youtube_feed_channels (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_youtube_feed_channels_user_added
  ON youtube_feed_channels(user_id, added_at DESC);
