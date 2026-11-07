-- Multi-provider metadata architecture. Additive only: 0001 is untouched.
PRAGMA foreign_keys = ON;

-- One row per metadata source KAIRO knows about: licence, terms and the attribution text shown in the UI.
CREATE TABLE IF NOT EXISTS data_sources (
  provider TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('dataset', 'api')),
  license_name TEXT,
  license_url TEXT,
  terms_url TEXT,
  attribution_text TEXT NOT NULL DEFAULT '',
  dataset_version TEXT,
  imported_at TEXT
);

-- Cross-provider ID map: the same title's ID at each provider. IDs only, never provider content.
CREATE TABLE IF NOT EXISTS anime_provider_ids (
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('dataset', 'match', 'manual')),
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, external_id),
  UNIQUE (anime_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_provider_ids_anime ON anime_provider_ids(anime_id);

-- Relations as the dataset reports them (a related entry's provider and ID); related_anime_id is filled when that entry is in the catalogue.
CREATE TABLE IF NOT EXISTS anime_relations (
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  related_provider TEXT NOT NULL,
  related_external_id TEXT NOT NULL,
  related_anime_id TEXT REFERENCES anime(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (anime_id, related_provider, related_external_id)
);
CREATE INDEX IF NOT EXISTS idx_relations_related ON anime_relations(related_anime_id);

-- Provenance of the values stored in the anime row (which source supplied each field, and when).
CREATE TABLE IF NOT EXISTS anime_field_sources (
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  provider TEXT NOT NULL,
  retrieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (anime_id, field)
);

INSERT OR IGNORE INTO data_sources (provider, display_name, kind, license_name, license_url, terms_url, attribution_text) VALUES
 ('manami', 'anime-offline-database', 'dataset', 'ODbL-1.0 (confirm per release)', 'https://github.com/manami-project/anime-offline-database/blob/master/LICENSE', 'https://github.com/manami-project/anime-offline-database', 'Catalogue index from the anime-offline-database by the manami project, used under the Open Database License (ODbL 1.0).'),
 ('anilist', 'AniList', 'api', NULL, NULL, 'https://docs.anilist.co/guide/terms-of-use', 'Anime details from AniList. KAIRO is an unofficial, personal project and is not affiliated with AniList.'),
 ('kitsu', 'Kitsu', 'api', NULL, NULL, 'https://kitsu.io/terms', 'Anime details from Kitsu. KAIRO is an unofficial, personal project and is not affiliated with Kitsu.');
