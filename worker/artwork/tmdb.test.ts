import { describe, expect, it, vi } from 'vitest';
import { createTmdbArtworkProvider, normalizeArtworkTitle, titleSimilarity } from './tmdb';

const signal = new AbortController().signal;

describe('TMDB artwork provider', () => {
  it('normalizes titles and scores punctuation/diacritic variants', () => {
    expect(normalizeArtworkTitle('Shingeki no Kyojin: The Final Season')).toBe('shingeki no kyojin the final season');
    expect(titleSimilarity('Attack on Titan', 'Attack on Titan')).toBe(1);
    expect(titleSimilarity('The Apothecary Diaries', 'The Apothecary Diaries (2023)')).toBeGreaterThan(0.7);
  });

  it('uses the TV search endpoint and maps poster/backdrop to secure TMDB image URLs', async () => {
    const requested: string[] = [];
    let authorization = '';
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      requested.push(url);
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      if (new URL(url).pathname === '/3/search/tv') {
        return Response.json({ results: [{
          id: 1429, name: 'Attack on Titan', original_name: '進撃の巨人', first_air_date: '2013-04-07',
          poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', media_type: 'tv', adult: false, vote_count: 100,
          overview: 'Search synopsis', vote_average: 8.1,
        }] });
      }
      return Response.json({
        first_air_date: '2013-04-07', overview: 'A war for humanity.', vote_average: 8.6,
        number_of_episodes: 87, genres: [{ id: 10759, name: 'Action' }, { id: 18, name: 'Drama' }],
      });
    });
    const provider = createTmdbArtworkProvider(fetcher, 'secret-read-token');
    const artwork = await provider.lookup({ title: 'Attack on Titan', year: 2013, format: 'series' }, signal);

    expect(new URL(requested[0]!).pathname).toBe('/3/search/tv');
    expect(new URL(requested[0]!).searchParams.get('query')).toBe('Attack on Titan');
    expect(new URL(requested[1]!).pathname).toBe('/3/tv/1429');
    expect(authorization).toBe('Bearer secret-read-token');
    expect(artwork).toEqual({
      tmdbId: 1429, mediaType: 'tv',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      overview: 'A war for humanity.', rating: 8.6, genres: ['Action', 'Drama'], releaseYear: 2013, episodeCount: 87,
    });
  });

  it('keeps usable search metadata when the details response has empty fields', async () => {
    const provider = createTmdbArtworkProvider(async (url) => {
      if (new URL(url).pathname === '/3/search/tv') {
        return Response.json({ results: [{
          id: 1429, name: 'Attack on Titan', first_air_date: '2013-04-07',
          poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', adult: false,
          overview: 'Search overview remains available.', vote_average: 8.2,
        }] });
      }
      return Response.json({ overview: '', vote_average: 0, first_air_date: '', genres: [] });
    }, 'token');
    const artwork = await provider.lookup({ title: 'Attack on Titan', year: 2013 }, signal);
    expect(artwork).toMatchObject({ overview: 'Search overview remains available.', rating: 8.2, releaseYear: 2013 });
  });

  it('retains search metadata when the details request fails', async () => {
    const paths: string[] = [];
    const provider = createTmdbArtworkProvider(async (url) => {
      const path = new URL(url).pathname;
      paths.push(path);
      if (path === '/3/search/tv') {
        return Response.json({ results: [{
          id: 1429, name: 'Attack on Titan', first_air_date: '2013-04-07',
          poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', adult: false,
          overview: 'Search summary remains available.', vote_average: 8.2,
        }] });
      }
      throw new Error('Details endpoint unavailable');
    }, 'token');
    const artwork = await provider.lookup({ title: 'Attack on Titan', year: 2013 }, signal);
    expect(paths).toEqual(['/3/search/tv', '/3/tv/1429']);
    expect(artwork).toMatchObject({ overview: 'Search summary remains available.', rating: 8.2, releaseYear: 2013 });
  });

  it('uses the dedicated TV images endpoint when search has no landscape backdrop', async () => {
    const requested: string[] = [];
    const provider = createTmdbArtworkProvider(async (url) => {
      requested.push(url);
      const path = new URL(url).pathname;
      if (path === '/3/search/tv') {
        return Response.json({ results: [{ id: 1429, name: 'Attack on Titan', first_air_date: '2013-04-07', poster_path: '/poster.jpg', backdrop_path: null, adult: false }] });
      }
      if (path === '/3/tv/1429') {
        return Response.json({ first_air_date: '2013-04-07', overview: 'Humanity fights for survival.', vote_average: 8.5, genres: [{ name: 'Action' }] });
      }
      return Response.json({
        posters: [{ file_path: '/alternate-poster.jpg', iso_639_1: 'en', vote_average: 7.2, vote_count: 20, width: 1000, height: 1500 }],
        backdrops: [{ file_path: '/wide-backdrop.jpg', iso_639_1: null, vote_average: 8.1, vote_count: 40, width: 1920, height: 1080 }],
      });
    }, 'token');

    const artwork = await provider.lookup({ title: 'Attack on Titan', year: 2013 }, signal);
    expect(new URL(requested[1]!).pathname).toBe('/3/tv/1429');
    expect(new URL(requested[2]!).pathname).toBe('/3/tv/1429/images');
    expect(new URL(requested[2]!).searchParams.get('include_image_language')).toBe('en,null');
    expect(artwork?.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(artwork?.bannerUrl).toBe('https://image.tmdb.org/t/p/w1280/wide-backdrop.jpg');
  });

  it('uses movie search for film titles', async () => {
    const requested: string[] = [];
    const provider = createTmdbArtworkProvider(async (url) => {
      requested.push(url);
      const path = new URL(url).pathname;
      if (path === '/3/search/movie') {
        return Response.json({ results: [{ id: 99, title: 'Your Name', original_title: '君の名は。', release_date: '2016-08-26', poster_path: '/movie.jpg', backdrop_path: null, adult: false }] });
      }
      if (path === '/3/movie/99') {
        return Response.json({ release_date: '2016-08-26', overview: 'Two teenagers swap lives.', vote_average: 8.3, genres: [{ name: 'Animation' }, { name: 'Drama' }] });
      }
      return Response.json({ posters: [], backdrops: [] });
    }, 'token');
    const artwork = await provider.lookup({ title: 'Your Name', year: 2016, format: 'movie' }, signal);
    expect(new URL(requested[0]!).pathname).toBe('/3/search/movie');
    // Search has no backdrop, so the provider correctly checks the movie images endpoint too.
    expect(new URL(requested[1]!).pathname).toBe('/3/movie/99');
    expect(new URL(requested[2]!).pathname).toBe('/3/movie/99/images');
    expect(artwork?.posterUrl).toBe('https://image.tmdb.org/t/p/w500/movie.jpg');
    expect(artwork?.bannerUrl).toBeNull();
    expect(artwork).toMatchObject({ overview: 'Two teenagers swap lives.', rating: 8.3, genres: ['Animation', 'Drama'], releaseYear: 2016, episodeCount: null });
  });

  it('loads season-local episode stills for a season-specific anime listing', async () => {
    const requested: string[] = [];
    const provider = createTmdbArtworkProvider(async (url) => {
      const path = new URL(url).pathname;
      requested.push(path);
      if (path === '/3/search/tv') return Response.json({ results: [{
        id: 1429, name: 'Kaiju No. 8', first_air_date: '2024-06-01', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', adult: false,
      }] });
      if (path === '/3/tv/1429') return Response.json({ seasons: [
        { season_number: 1, air_date: '2024-06-01', episode_count: 12 },
        { season_number: 2, air_date: '2025-07-01', episode_count: 11 },
      ] });
      if (path === '/3/tv/1429/season/2') return Response.json({ episodes: [
        { episode_number: 1, still_path: '/kaiju-s2-ep1.jpg' },
        { episode_number: 2, still_path: '/kaiju-s2-ep2.jpg' },
      ] });
      return Response.json({});
    }, 'token');
    const input = { title: 'Kaiju No. 8 Season 2', year: 2025, format: 'series' };
    const artwork = await provider.lookup(input, signal);
    const stills = await provider.episodeStills?.(artwork!, input, signal);
    expect(requested).toEqual(['/3/search/tv', '/3/tv/1429', '/3/tv/1429', '/3/tv/1429/season/2']);
    expect(stills).toEqual({
      1: 'https://image.tmdb.org/t/p/w780/kaiju-s2-ep1.jpg',
      2: 'https://image.tmdb.org/t/p/w780/kaiju-s2-ep2.jpg',
    });
  });

  it('rejects weak matches and unsafe image paths', async () => {
    const provider = createTmdbArtworkProvider(async () => Response.json({ results: [{ id: 10, name: 'Completely Different Show', poster_path: 'https://evil.test/image.jpg', backdrop_path: '/../bad.jpg' }] }), 'token');
    expect(await provider.lookup({ title: 'Death Note', year: 2006, format: 'series' }, signal)).toBeNull();
  });

  it('rejects an exact title match from a substantially different release year', async () => {
    const provider = createTmdbArtworkProvider(async () => Response.json({ results: [{
      id: 1429, name: 'Attack on Titan', first_air_date: '2013-04-07', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', adult: false,
    }] }), 'token');
    expect(await provider.lookup({ title: 'Attack on Titan', year: 2024, format: 'series' }, signal)).toBeNull();
  });

  it('does not send requests without a token', async () => {
    const fetcher = vi.fn(async () => Response.json({ results: [] }));
    const provider = createTmdbArtworkProvider(fetcher, '  ');
    expect(await provider.lookup({ title: 'Naruto' }, signal)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
