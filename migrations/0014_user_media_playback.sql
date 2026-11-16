-- One account-scoped resume record and player-state snapshot for every Kairo media player.
-- Existing per-media history/list tables remain for their current UI and deletion semantics.
CREATE TABLE IF NOT EXISTS user_media_playback (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'movie', 'youtube')),
  media_key TEXT NOT NULL,
  title TEXT NOT NULL,
  artwork_url TEXT,
  duration_seconds REAL,
  progress_seconds REAL NOT NULL DEFAULT 0 CHECK (progress_seconds >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  player_state_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, media_type, media_key)
);
CREATE INDEX IF NOT EXISTS idx_user_media_playback_recent
  ON user_media_playback(user_id, updated_at DESC);
