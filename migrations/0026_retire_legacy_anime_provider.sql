-- Retire the old catalogue provider while retaining users' saved references as inert legacy IDs.
-- Historical migrations are immutable; this migration translates their stored provider key to "legacy".
PRAGMA foreign_keys = ON;

CREATE TABLE user_anime_library_refs_v26 (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('legacy', 'mal', 'hianime')),
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 9),
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 128),
  status TEXT CHECK (status IS NULL OR status IN ('watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped')),
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id, external_id)
);

INSERT INTO user_anime_library_refs_v26
  (user_id, provider_id, external_id, slug, status, is_favorite, added_at, updated_at)
SELECT user_id,
       CASE WHEN provider_id = 'anilist' THEN 'legacy' ELSE provider_id END,
       external_id, slug, status, is_favorite, added_at, updated_at
FROM user_anime_library_refs;

DROP TABLE user_anime_library_refs;
ALTER TABLE user_anime_library_refs_v26 RENAME TO user_anime_library_refs;
CREATE INDEX IF NOT EXISTS idx_user_anime_library_refs_recent
  ON user_anime_library_refs(user_id, updated_at DESC);

-- Keep old cross-provider identifiers as non-routable historical mappings.
UPDATE OR IGNORE anime_provider_ids SET provider = 'legacy' WHERE provider = 'anilist';
DELETE FROM anime_provider_ids WHERE provider = 'anilist';
UPDATE OR IGNORE anime_relations SET related_provider = 'legacy' WHERE related_provider = 'anilist';
DELETE FROM anime_relations WHERE related_provider = 'anilist';
UPDATE anime_field_sources SET provider = 'legacy' WHERE provider = 'anilist';
DELETE FROM data_sources WHERE provider = 'anilist';
