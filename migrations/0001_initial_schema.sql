PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS anime (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  alt_titles_json TEXT NOT NULL DEFAULT '[]',
  synopsis TEXT NOT NULL DEFAULT '',
  poster_url TEXT,
  banner_url TEXT,
  format TEXT,
  release_year INTEGER,
  season TEXT,
  status TEXT,
  rating REAL,
  episode_count INTEGER,
  genres_json TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  popularity_score REAL NOT NULL DEFAULT 0,
  provider_id TEXT,
  provider_title_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_id, provider_title_id)
);

CREATE INDEX IF NOT EXISTS idx_anime_featured ON anime(featured, popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_anime_updated ON anime(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_anime_year ON anime(release_year DESC);
CREATE INDEX IF NOT EXISTS idx_anime_title ON anime(title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  episode_number REAL NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  synopsis TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  provider_id TEXT,
  provider_episode_id TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(anime_id, episode_number),
  UNIQUE(provider_id, provider_episode_id)
);

CREATE INDEX IF NOT EXISTS idx_episodes_anime_number ON episodes(anime_id, episode_number);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  identity_subject TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  profile_visibility TEXT NOT NULL DEFAULT 'private' CHECK (profile_visibility IN ('private', 'public')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'astral-plum',
  interface_language TEXT NOT NULL DEFAULT 'en',
  subtitle_language TEXT NOT NULL DEFAULT 'en',
  autoplay_next INTEGER NOT NULL DEFAULT 1 CHECK (autoplay_next IN (0, 1)),
  default_playback_speed REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_library (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped')),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, anime_id)
);

CREATE INDEX IF NOT EXISTS idx_user_library_status ON user_library(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_library_favorites ON user_library(user_id, is_favorite, updated_at DESC);

CREATE TABLE IF NOT EXISTS watch_progress (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position_seconds REAL NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_progress_updated ON watch_progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS viewing_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  watched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_viewing_history_user_date ON viewing_history(user_id, watched_at DESC);
