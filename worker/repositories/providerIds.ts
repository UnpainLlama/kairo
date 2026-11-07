// SQL for the cross-provider ID map (migrations/0002_provider_architecture.sql). All values are bound parameters.
export const PROVIDER_IDS_SQL = 'SELECT provider, external_id AS externalId FROM anime_provider_ids WHERE anime_id = ?';

/** First writer wins: an existing mapping is never overwritten by a later guess. */
export const INSERT_PROVIDER_ID_SQL =
  `INSERT OR IGNORE INTO anime_provider_ids (anime_id, provider, external_id, source, confidence) VALUES (?, ?, ?, 'match', ?)`;

export const BASE_RECORD_SQL =
  `SELECT id, slug, title, alt_titles_json AS altTitlesJson, synopsis, poster_url AS posterUrl, banner_url AS bannerUrl, format,
          release_year AS releaseYear, season, status, rating, episode_count AS episodeCount, genres_json AS genresJson,
          provider_id AS providerId, updated_at AS updatedAt
   FROM anime WHERE id = ? OR slug = ? LIMIT 1`;
