-- Account-backed Movies playback progress and live-catalogue Anime library references.
-- These tables store only user-owned state and display metadata supplied by the app.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_movie_watch_progress (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK (provider_id = 'tmdb'),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  poster_url TEXT,
  backdrop_url TEXT,
  progress_seconds REAL NOT NULL DEFAULT 0 CHECK (progress_seconds >= 0),
  duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_user_movie_watch_progress_recent
  ON user_movie_watch_progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_anime_library_refs (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('anilist', 'mal', 'hianime')),
  external_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  poster_url TEXT,
  banner_url TEXT,
  format TEXT,
  release_year INTEGER,
  rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
  episode_count INTEGER,
  status TEXT NOT NULL CHECK (status IN ('watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped')),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_user_anime_library_refs_recent
  ON user_anime_library_refs(user_id, updated_at DESC);
