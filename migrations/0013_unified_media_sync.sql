-- Cross-device account library references for live provider-backed Movies.
-- Persist only the provider namespace and external identifier here. Display metadata
-- is loaded through the Movies provider API and is not copied into this user table.
CREATE TABLE IF NOT EXISTS user_movie_library_refs (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT CHECK (status IS NULL OR status IN ('watchlist', 'watched')),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_user_movie_library_refs_recent
  ON user_movie_library_refs(user_id, updated_at DESC);

-- A deletion marker prevents an older offline Anime client from recreating an entry
-- after the user has explicitly removed it on another device.
CREATE TABLE IF NOT EXISTS user_watch_history_tombstones (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  anime_slug TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, anime_slug, episode_number)
);
CREATE INDEX IF NOT EXISTS idx_user_watch_history_tombstones_user
  ON user_watch_history_tombstones(user_id, deleted_at DESC);

CREATE TABLE IF NOT EXISTS user_watch_history_clear_markers (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  cleared_at INTEGER NOT NULL
);
