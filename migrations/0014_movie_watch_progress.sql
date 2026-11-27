-- Cross-device movie playback progress, separate from the user's saved-library state.
-- Progress is keyed by provider identity and updated with client event timestamps so
-- delayed events from an older playback session cannot overwrite a newer position.
CREATE TABLE IF NOT EXISTS user_movie_watch_progress (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  progress_seconds REAL NOT NULL CHECK (progress_seconds >= 0),
  duration_seconds REAL NOT NULL CHECK (duration_seconds > 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_user_movie_watch_progress_recent
  ON user_movie_watch_progress(user_id, completed, updated_at DESC);
