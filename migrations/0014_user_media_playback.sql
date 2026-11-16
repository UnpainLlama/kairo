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

-- Backfill the shared playback index from existing account-owned histories.
INSERT INTO user_media_playback
  (user_id, media_type, media_key, title, artwork_url, duration_seconds,
   progress_seconds, completed, player_state_json, updated_at)
SELECT user_id, 'anime', anime_slug || ':' || episode_number, title, poster_url,
       duration_seconds, progress_seconds, 0, '{}', updated_at
FROM user_watch_history
WHERE 1
ON CONFLICT(user_id, media_type, media_key) DO NOTHING;

INSERT INTO user_media_playback
  (user_id, media_type, media_key, title, artwork_url, duration_seconds,
   progress_seconds, completed, player_state_json, updated_at)
SELECT user_id, 'youtube', video_id, title, thumbnail_url, duration_seconds,
       progress_seconds, completed, '{}', updated_at
FROM youtube_watch_history
WHERE 1
ON CONFLICT(user_id, media_type, media_key) DO NOTHING;
