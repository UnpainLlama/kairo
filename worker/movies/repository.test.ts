import { describe, expect, it } from 'vitest';
import { movieIdentity, persistMovieSummary, searchStoredMovies, toStoredMovie, type MovieDatabase, type MovieStatement } from './repository';
import type { MovieSummary } from './types';

const summary: MovieSummary = {
  providerId: 'tmdb',
  externalId: '603',
  title: 'The Matrix',
  originalTitle: 'The Matrix',
  overview: 'A hacker discovers reality.',
  releaseDate: '1999-03-31',
  releaseYear: 1999,
  originalLanguage: 'en',
  posterUrl: 'https://image.tmdb.org/t/p/w500/matrix.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/matrix.jpg',
  voteAverage: 8.2,
  voteCount: 24000,
  popularity: 95.4,
  adult: false,
};

describe('Movies repository', () => {
  it('generates provider-namespaced Kairo IDs and slugs', () => {
    expect(movieIdentity('tmdb', '603')).toEqual({
      id: 'movie:tmdb:603',
      slug: 'film-tmdb-603',
    });
    expect(toStoredMovie(summary)).toMatchObject({ id: 'movie:tmdb:603', title: 'The Matrix', metadataProvider: 'tmdb' });
  });

  it('upserts movie summary and the external provider ID', async () => {
    const statements: { sql: string; values: unknown[] }[] = [];
    const db: MovieDatabase = {
      prepare(sql: string): MovieStatement {
        return {
          bind(...values: unknown[]) {
            return {
              bind: () => this,
              run: async () => { statements.push({ sql, values }); return {}; },
              first: async () => null,
              all: async () => ({ results: [] }),
            };
          },
          run: async () => ({}),
          first: async () => null,
          all: async () => ({ results: [] }),
        };
      },
    };
    await persistMovieSummary(db, summary, '2026-11-13T00:00:00.000Z');
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toContain('ON CONFLICT(id) DO UPDATE');
    expect(statements[0]?.values[0]).toBe('movie:tmdb:603');
    expect(statements[1]?.sql).toContain('movie_external_ids');
    expect(statements[1]?.values).toEqual(['movie:tmdb:603', 'tmdb', '603']);
  });

  it('searches only the stored Movies catalogue with a bounded phrase', async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const db: MovieDatabase = {
      prepare(sql: string): MovieStatement {
        return {
          bind(...values: unknown[]) {
            calls.push({ sql, values });
            return this as MovieStatement;
          },
          run: async () => ({}),
          first: async <T>() => ({ total: 1 }) as T,
          all: async <T>() => ({ results: [{ id: 'movie:tmdb:603', title: 'The Matrix' }] as T[] }),
        };
      },
    };
    const result = await searchStoredMovies(db, 'Matrix', 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('movie:tmdb:603');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql).toContain('FROM movies');
    expect(calls[0]?.sql).not.toContain('FROM anime');
    expect(calls[0]?.values.slice(0, 2)).toEqual(['%Matrix%', '%Matrix%']);
  });
});
