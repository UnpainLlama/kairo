-- Compact, account-scoped watch history. One row per anime episode.
CREATE TABLE IF NOT EXISTS user_watch_history (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  anime_slug TEXT NOT NULL,
  episode_number INTEGER NOT NULL CHECK (episode_number > 0),
  title TEXT NOT NULL,
  poster_url TEXT,
  episode_title TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER,
  progress_seconds REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, anime_slug, episode_number)
);
CREATE INDEX IF NOT EXISTS idx_user_watch_history_recent
  ON user_watch_history(user_id, updated_at DESC);
