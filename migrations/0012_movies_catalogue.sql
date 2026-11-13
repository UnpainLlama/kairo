-- Independent Movies catalogue. This domain intentionally has no foreign keys to anime,
-- episodes, anime providers, or anime watch-progress tables.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS movies (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  release_date TEXT,
  release_year INTEGER CHECK (release_year IS NULL OR (release_year >= 1800 AND release_year <= 2200)),
  runtime_minutes INTEGER CHECK (runtime_minutes IS NULL OR runtime_minutes > 0),
  original_language TEXT,
  release_status TEXT,
  adult INTEGER NOT NULL DEFAULT 0 CHECK (adult IN (0, 1)),
  poster_path TEXT,
  backdrop_path TEXT,
  homepage_url TEXT,
  vote_average REAL CHECK (vote_average IS NULL OR (vote_average >= 0 AND vote_average <= 10)),
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  popularity REAL NOT NULL DEFAULT 0 CHECK (popularity >= 0),
  production_countries_json TEXT NOT NULL DEFAULT '[]',
  spoken_languages_json TEXT NOT NULL DEFAULT '[]',
  metadata_provider TEXT NOT NULL,
  metadata_fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_movies_release_year ON movies(release_year DESC);
CREATE INDEX IF NOT EXISTS idx_movies_popularity ON movies(popularity DESC, vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_movies_rating ON movies(vote_average DESC, vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title COLLATE NOCASE);

-- Namespaced provider IDs prevent collisions between external identifier systems.
CREATE TABLE IF NOT EXISTS movie_external_ids (
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (movie_id, provider_id),
  UNIQUE (provider_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_movie_external_ids_lookup ON movie_external_ids(provider_id, external_id);

CREATE TABLE IF NOT EXISTS movie_genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (provider_id, external_id)
);

CREATE TABLE IF NOT EXISTS movie_genre_links (
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES movie_genres(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_movie_genre_links_genre ON movie_genre_links(genre_id, movie_id);

CREATE TABLE IF NOT EXISTS movie_credits (
  id TEXT PRIMARY KEY,
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  external_person_id TEXT,
  name TEXT NOT NULL,
  credit_type TEXT NOT NULL CHECK (credit_type IN ('cast', 'crew')),
  department TEXT,
  job TEXT,
  character_name TEXT,
  profile_path TEXT,
  credit_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_movie_credits_movie_type_order ON movie_credits(movie_id, credit_type, credit_order);
CREATE INDEX IF NOT EXISTS idx_movie_credits_person ON movie_credits(provider_id, external_person_id);

-- User library records are independent from Anime's user_library table.
CREATE TABLE IF NOT EXISTS user_movie_library (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'watchlist' CHECK (status IN ('watchlist', 'watched')),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10)),
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, movie_id)
);
CREATE INDEX IF NOT EXISTS idx_user_movie_library_status ON user_movie_library(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_movie_library_favorites ON user_movie_library(user_id, is_favorite, updated_at DESC);

-- Availability is country-specific, but it never controls whether a movie exists in the
-- global catalogue. Populate this table only from an authorised availability provider.
CREATE TABLE IF NOT EXISTS movie_availability_offers (
  id TEXT PRIMARY KEY,
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  source_provider TEXT NOT NULL,
  region_code TEXT NOT NULL CHECK (length(region_code) = 2),
  service_id TEXT,
  service_name TEXT NOT NULL,
  monetization_type TEXT NOT NULL CHECK (monetization_type IN ('flatrate', 'rent', 'buy', 'ads', 'free', 'none')),
  presentation_type TEXT,
  price_amount REAL CHECK (price_amount IS NULL OR price_amount >= 0),
  currency TEXT,
  target_url TEXT NOT NULL,
  source_page_url TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (movie_id, source_provider, region_code, service_id, monetization_type, presentation_type, target_url)
);
CREATE INDEX IF NOT EXISTS idx_movie_availability_region ON movie_availability_offers(movie_id, region_code, fetched_at DESC);
