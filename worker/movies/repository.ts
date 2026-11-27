import type { MovieDetail, MovieSummary } from './types';

export interface MovieStatement {
  bind(...values: unknown[]): MovieStatement;
  run(): Promise<unknown>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
}
export interface MovieDatabase {
  prepare(sql: string): MovieStatement;
}

export type StoredMovie = {
  id: string;
  slug: string;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number | null;
  voteCount: number;
  popularity: number;
  metadataProvider: string;
};

function slugPart(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'film';
}

export function movieIdentity(providerId: string, externalId: string): { id: string; slug: string } {
  const safeProvider = providerId.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const safeExternal = externalId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeProvider || !safeExternal) throw new Error('Invalid movie provider identity.');
  return {
    id: `movie:${safeProvider}:${safeExternal}`,
    slug: `film-${safeProvider}-${safeExternal}`,
  };
}

export function toStoredMovie(summary: MovieSummary): StoredMovie {
  const identity = movieIdentity(summary.providerId, summary.externalId);
  return {
    ...identity,
    title: summary.title,
    originalTitle: summary.originalTitle,
    overview: summary.overview,
    releaseDate: summary.releaseDate,
    releaseYear: summary.releaseYear,
    posterUrl: summary.posterUrl,
    backdropUrl: summary.backdropUrl,
    voteAverage: summary.voteAverage,
    voteCount: summary.voteCount,
    popularity: summary.popularity,
    metadataProvider: summary.providerId,
  };
}

/** Idempotently upsert one summary. This does not trigger bulk catalogue collection. */
export async function persistMovieSummary(db: MovieDatabase, summary: MovieSummary, fetchedAt: string): Promise<string> {
  const movie = toStoredMovie(summary);
  await db.prepare(
    `INSERT INTO movies (
       id, slug, title, original_title, overview, release_date, release_year,
       original_language, adult, poster_url, backdrop_url, vote_average,
       vote_count, popularity, metadata_provider, metadata_fetched_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       original_title = excluded.original_title,
       overview = excluded.overview,
       release_date = excluded.release_date,
       release_year = excluded.release_year,
       original_language = excluded.original_language,
       adult = excluded.adult,
       poster_url = excluded.poster_url,
       backdrop_url = excluded.backdrop_url,
       vote_average = excluded.vote_average,
       vote_count = excluded.vote_count,
       popularity = excluded.popularity,
       metadata_provider = excluded.metadata_provider,
       metadata_fetched_at = excluded.metadata_fetched_at,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(
    movie.id, movie.slug, movie.title, movie.originalTitle, movie.overview,
    movie.releaseDate, movie.releaseYear, summary.originalLanguage, summary.adult ? 1 : 0,
    movie.posterUrl, movie.backdropUrl, movie.voteAverage, movie.voteCount,
    movie.popularity, movie.metadataProvider, fetchedAt,
  ).run();

  await db.prepare(
    `INSERT INTO movie_external_ids (movie_id, provider_id, external_id, is_primary)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(provider_id, external_id) DO UPDATE SET movie_id = excluded.movie_id`
  ).bind(movie.id, summary.providerId, summary.externalId).run();

  return movie.id;
}

/** Persist detail metadata after the same provider/licensing gate as summary ingestion. */
export async function persistMovieDetail(db: MovieDatabase, detail: MovieDetail, fetchedAt: string): Promise<string> {
  const movieId = await persistMovieSummary(db, detail, fetchedAt);
  await db.prepare(
    `UPDATE movies SET tagline = ?, runtime_minutes = ?, release_status = ?, homepage_url = ?,
       production_countries_json = ?, spoken_languages_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    detail.tagline,
    detail.runtimeMinutes,
    detail.releaseStatus,
    detail.homepageUrl,
    JSON.stringify(detail.productionCountries),
    JSON.stringify(detail.spokenLanguages),
    movieId,
  ).run();

  await db.prepare('DELETE FROM movie_genre_links WHERE movie_id = ?').bind(movieId).run();
  for (const genre of detail.genres) {
    await db.prepare(
      `INSERT INTO movie_genres (provider_id, external_id, name)
       VALUES (?, ?, ?)
       ON CONFLICT(provider_id, external_id) DO UPDATE SET name = excluded.name`
    ).bind(detail.providerId, genre.externalId, genre.name).run();
    const stored = await db.prepare(
      'SELECT id FROM movie_genres WHERE provider_id = ? AND external_id = ? LIMIT 1'
    ).bind(detail.providerId, genre.externalId).first<{ id: number }>();
    if (stored) {
      await db.prepare(
        'INSERT OR IGNORE INTO movie_genre_links (movie_id, genre_id) VALUES (?, ?)'
      ).bind(movieId, stored.id).run();
    }
  }

  await db.prepare('DELETE FROM movie_credits WHERE movie_id = ?').bind(movieId).run();
  const credits = [
    ...detail.cast.map((credit, index) => ({ ...credit, creditType: 'cast' as const, order: credit.order ?? index })),
    ...detail.crew.map((credit, index) => ({ ...credit, creditType: 'crew' as const, order: credit.order ?? index })),
  ];
  for (const [index, credit] of credits.entries()) {
    const personKey = credit.externalPersonId ?? `name-${slugPart(credit.name)}-${index}`;
    const id = `${movieId}:${credit.creditType}:${detail.providerId}:${personKey}`.slice(0, 240);
    await db.prepare(
      `INSERT INTO movie_credits (
         id, movie_id, provider_id, external_person_id, name, credit_type,
         department, job, character_name, profile_url, credit_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, department = excluded.department, job = excluded.job,
         character_name = excluded.character_name, profile_url = excluded.profile_url,
         credit_order = excluded.credit_order`
    ).bind(
      id, movieId, detail.providerId, credit.externalPersonId, credit.name,
      credit.creditType, credit.department, credit.job, credit.character,
      credit.profileUrl, credit.order,
    ).run();
  }

  if (detail.imdbId) {
    await db.prepare(
      `INSERT INTO movie_external_ids (movie_id, provider_id, external_id, is_primary)
       VALUES (?, 'imdb', ?, 0)
       ON CONFLICT(provider_id, external_id) DO UPDATE SET movie_id = excluded.movie_id`
    ).bind(movieId, detail.imdbId).run();
  }
  return movieId;
}

export type MovieSearchRow = {
  id: string;
  slug: string;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number | null;
  voteCount: number;
  popularity: number;
};

export async function searchStoredMovies(
  db: MovieDatabase,
  query: string,
  page: number,
  limit: number,
): Promise<{ items: MovieSearchRow[]; page: number; limit: number; total: number; hasNextPage: boolean }> {
  const term = query.trim().slice(0, 100);
  const offset = (page - 1) * limit;
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const where = "title COLLATE NOCASE LIKE ? ESCAPE '\\' OR original_title COLLATE NOCASE LIKE ? ESCAPE '\\'";
  const [items, count] = await Promise.all([
    db.prepare(
      `SELECT id, slug, title, original_title AS originalTitle, overview,
              release_date AS releaseDate, release_year AS releaseYear,
              poster_url AS posterUrl, backdrop_url AS backdropUrl,
              vote_average AS voteAverage, vote_count AS voteCount, popularity
       FROM movies WHERE (${where})
       ORDER BY popularity DESC, vote_count DESC, title COLLATE NOCASE
       LIMIT ? OFFSET ?`
    ).bind(pattern, pattern, limit, offset).all<MovieSearchRow>(),
    db.prepare(`SELECT COUNT(*) AS total FROM movies WHERE (${where})`)
      .bind(pattern, pattern).first<{ total: number }>(),
  ]);
  const total = Number(count?.total ?? 0);
  return { items: items.results ?? [], page, limit, total, hasNextPage: offset + limit < total };
}
