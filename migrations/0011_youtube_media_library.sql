-- Account-scoped YouTube playback history and Kairo Watch Later.
CREATE TABLE IF NOT EXISTS youtube_watch_history (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL CHECK (length(video_id) = 11),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  channel_id TEXT,
  channel_title TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  duration_seconds INTEGER,
  progress_seconds REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_youtube_watch_history_recent
  ON youtube_watch_history(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS youtube_watch_later (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL CHECK (length(video_id) = 11),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  channel_id TEXT,
  channel_title TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  duration_seconds INTEGER,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_youtube_watch_later_recent
  ON youtube_watch_later(user_id, saved_at DESC);
