// Catalogue SQL. Everything user-controlled goes through bind parameters; the only text interpolated into SQL
// is static (column lists, and ORDER BY fragments chosen from fixed whitelists). Pure functions, no D1 import.
import { SORT_ORDER_BY, type Pagination, type SearchParams } from '../lib/validation';

export type BuiltQuery = { sql: string; binds: unknown[]; countSql: string; countBinds: unknown[] };

export const cardColumns = (p = ''): string =>
  `${p}id, ${p}slug, ${p}title, ${p}synopsis, ${p}poster_url AS posterUrl, ${p}banner_url AS bannerUrl, ${p}format, ` +
  `${p}release_year AS releaseYear, ${p}season, ${p}status, ${p}rating, ${p}episode_count AS episodeCount, ${p}genres_json AS genresJson`;

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

export function buildSearchQuery(p: SearchParams): BuiltQuery {
  const like = `%${escapeLike(p.q)}%`;
  const where = [`(title LIKE ? ESCAPE '\\' OR alt_titles_json LIKE ? ESCAPE '\\')`];
  const binds: unknown[] = [like, like];

  if (p.genre) {
    // genres_json is a JSON array of strings, so match the quoted element.
    where.push(`genres_json LIKE ? ESCAPE '\\'`);
    binds.push(`%${escapeLike(JSON.stringify(p.genre))}%`);
  }
  if (p.year !== undefined) { where.push('release_year = ?'); binds.push(p.year); }
  if (p.format) { where.push('LOWER(format) = ?'); binds.push(p.format); }
  if (p.status) { where.push('LOWER(status) = ?'); binds.push(p.status); }
  if (p.season) { where.push('LOWER(season) = ?'); binds.push(p.season); }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  return {
    sql: `SELECT ${cardColumns()} FROM anime ${whereSql} ORDER BY ${SORT_ORDER_BY[p.sort]} LIMIT ? OFFSET ?`,
    binds: [...binds, p.limit, p.offset],
    countSql: `SELECT COUNT(*) AS total FROM anime ${whereSql}`,
    countBinds: binds,
  };
}

// "trending" ranks by popularity_score and "latest" by the catalogue row's updated_at.
// Both are only as meaningful as the data ingestion writes into those columns.
const LIST_ORDER = {
  trending: 'popularity_score DESC, title COLLATE NOCASE',
  latest: 'updated_at DESC, title COLLATE NOCASE',
} as const;

export function buildListQuery(kind: keyof typeof LIST_ORDER, p: Pagination): BuiltQuery {
  return {
    sql: `SELECT ${cardColumns()} FROM anime ORDER BY ${LIST_ORDER[kind]} LIMIT ? OFFSET ?`,
    binds: [p.limit, p.offset],
    countSql: 'SELECT COUNT(*) AS total FROM anime',
    countBinds: [],
  };
}

// Genres are derived from the JSON arrays already stored on each title. A row with malformed JSON is skipped, not fatal.
export const GENRES_SQL =
  `SELECT g.value AS name, COUNT(*) AS count ` +
  `FROM anime a, json_each(CASE WHEN json_valid(a.genres_json) THEN a.genres_json ELSE '[]' END) g ` +
  `WHERE g.type = 'text' GROUP BY g.value ORDER BY g.value COLLATE NOCASE`;

// "Related" here means "shares genres". There is no provider relation data in the schema yet.
export function buildRelatedQuery(animeId: string, genres: string[], limit: number): { sql: string; binds: unknown[] } {
  return {
    sql:
      `SELECT ${cardColumns('a.')}, COUNT(DISTINCT g.value) AS sharedGenres ` +
      `FROM anime a, json_each(CASE WHEN json_valid(a.genres_json) THEN a.genres_json ELSE '[]' END) g ` +
      `WHERE a.id != ? AND g.value IN (SELECT value FROM json_each(?)) ` +
      `GROUP BY a.id ORDER BY sharedGenres DESC, a.popularity_score DESC, a.title COLLATE NOCASE LIMIT ?`,
    binds: [animeId, JSON.stringify(genres), limit],
  };
}
