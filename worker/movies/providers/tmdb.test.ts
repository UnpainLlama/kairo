import { describe, expect, it } from 'vitest';
import { createTmdbMovieProvider, TMDB_MOVIES_ATTRIBUTION } from './tmdb';

const signal = new AbortController().signal;
const summaryFixture = {
  id: 603,
  title: 'The Matrix',
  original_title: 'The Matrix',
  overview: 'A computer hacker learns the truth.',
  release_date: '1999-03-31',
  original_language: 'en',
  poster_path: '/matrix-poster.jpg',
  backdrop_path: '/matrix-backdrop.jpg',
  vote_average: 8.2,
  vote_count: 24000,
  popularity: 95.4,
  adult: false,
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers });

describe('TMDB Movies provider', () => {
  it('maps global discovery and does not send a region filter', async () => {
    let requested = '';
    const provider = createTmdbMovieProvider(async (url) => {
      requested = url;
      return json({ page: 1, total_pages: 1, total_results: 1, results: [summaryFixture] });
    }, 'read-token');

    const page = await provider.discover({ kind: 'popular', page: 1 }, signal);
    const url = new URL(requested);
    expect(url.pathname).toBe('/3/movie/popular');
    expect(url.searchParams.has('region')).toBe(false);
    expect(url.searchParams.has('watch_region')).toBe(false);
    expect(page.items[0]).toMatchObject({
      providerId: 'tmdb',
      externalId: '603',
      title: 'The Matrix',
      releaseYear: 1999,
      posterUrl: 'https://image.tmdb.org/t/p/w500/matrix-poster.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/matrix-backdrop.jpg',
      voteAverage: 8.2,
    });
  });

  it('uses Bearer auth and maps detail, credits, genres, and IMDb IDs', async () => {
    let requested = '';
    let authorization = '';
    const provider = createTmdbMovieProvider(async (url, init) => {
      requested = url;
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return json({
        ...summaryFixture,
        tagline: 'Welcome to the real world.',
        runtime: 136,
        status: 'Released',
        homepage: 'https://www.warnerbros.com/movies/matrix',
        genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }],
        production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }],
        spoken_languages: [{ iso_639_1: 'en', name: 'English', english_name: 'English' }],
        credits: {
          cast: [{ id: 1, name: 'Keanu Reeves', character: 'Neo', order: 0, profile_path: '/cast.jpg' }],
          crew: [{ id: 2, name: 'Lana Wachowski', department: 'Directing', job: 'Director', profile_path: null }],
        },
        external_ids: { imdb_id: 'tt0133093' },
      });
    }, 'read-token');

    const detail = await provider.byId('603', signal);
    expect(new URL(requested).pathname).toBe('/3/movie/603');
    expect(authorization).toBe('Bearer read-token');
    expect(detail).toMatchObject({
      tagline: 'Welcome to the real world.',
      runtimeMinutes: 136,
      imdbId: 'tt0133093',
      genres: [{ externalId: '28', name: 'Action' }, { externalId: '878', name: 'Science Fiction' }],
      cast: [{ name: 'Keanu Reeves', character: 'Neo' }],
      crew: [{ name: 'Lana Wachowski', job: 'Director' }],
    });
  });

  it('encodes the search term and accepts a year filter', async () => {
    let requested = '';
    const provider = createTmdbMovieProvider(async (url) => {
      requested = url;
      return json({ page: 1, total_pages: 0, total_results: 0, results: [] });
    }, 'read-token');

    await provider.search({ query: 'A & B', page: 2, year: 2020 }, signal);
    const url = new URL(requested);
    expect(url.pathname).toBe('/3/search/movie');
    expect(url.searchParams.get('query')).toBe('A & B');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('primary_release_year')).toBe('2020');
  });

  it('uses discover when filters are supplied and remains region-neutral', async () => {
    let requested = '';
    const provider = createTmdbMovieProvider(async (url) => {
      requested = url;
      return json({ page: 1, results: [] });
    }, 'read-token');

    await provider.discover({ kind: 'top_rated', page: 1, year: 2024, genreIds: ['28'] }, signal);
    const url = new URL(requested);
    expect(url.pathname).toBe('/3/discover/movie');
    expect(url.searchParams.get('sort_by')).toBe('vote_average.desc');
    expect(url.searchParams.get('with_genres')).toBe('28');
    expect(url.searchParams.has('region')).toBe(false);
  });

  it('moves adult-inclusive discovery to the discover endpoint explicitly', async () => {
    let requested = '';
    const provider = createTmdbMovieProvider(async (url) => {
      requested = url;
      return json({ page: 1, results: [] });
    }, 'read-token');

    await provider.discover({ kind: 'trending_day', page: 1, includeAdult: true }, signal);
    const url = new URL(requested);
    expect(url.pathname).toBe('/3/discover/movie');
    expect(url.searchParams.get('include_adult')).toBe('true');
  });

  it('rejects malformed IDs and records the approved non-commercial terms', async () => {
    const provider = createTmdbMovieProvider(async () => { throw new Error('should not fetch'); }, 'read-token');
    await expect(provider.byId('1; DROP TABLE movies', signal)).rejects.toMatchObject({ kind: 'not_found' });
    expect(provider.termsVerified).toBe(true);
    expect(TMDB_MOVIES_ATTRIBUTION.text).toContain('not endorsed or certified');
  });

  it('maps rate limits and missing credentials to typed errors', async () => {
    const limited = createTmdbMovieProvider(async () => json({}, 429, { 'Retry-After': '30' }), 'token');
    await expect(limited.discover({ kind: 'popular', page: 1 }, signal))
      .rejects.toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 30 });

    const missing = createTmdbMovieProvider(async () => { throw new Error('should not fetch'); }, undefined);
    await expect(missing.discover({ kind: 'popular', page: 1 }, signal))
      .rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('drops malformed items and unsafe image paths without failing the page', async () => {
    const provider = createTmdbMovieProvider(async () => json({
      page: 1,
      results: [
        summaryFixture,
        { ...summaryFixture, id: 604, title: '' },
        { ...summaryFixture, id: 605, poster_path: '/../secret.jpg' },
      ],
    }), 'token');
    const page = await provider.discover({ kind: 'popular', page: 1 }, signal);
    expect(page.items).toHaveLength(2);
    expect(page.items[1]?.posterUrl).toBeNull();
  });
});
