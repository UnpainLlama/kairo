-- Account-scoped Anime library references for provider-backed live catalogue titles.
-- Keep only the provider namespace and external ID; metadata continues to come from the
-- configured catalogue provider rather than browser-supplied title/artwork fields.
CREATE TABLE IF NOT EXISTS user_anime_library_refs (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('anilist', 'mal', 'hianime')),
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 9),
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 128),
  status TEXT CHECK (status IS NULL OR status IN ('watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped')),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_user_anime_library_refs_recent
  ON user_anime_library_refs(user_id, updated_at DESC);
