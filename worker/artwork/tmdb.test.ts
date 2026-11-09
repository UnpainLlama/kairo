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
    let requested = '';
    let authorization = '';
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      requested = url;
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return Response.json({ results: [{
        id: 1429, name: 'Attack on Titan', original_name: '進撃の巨人', first_air_date: '2013-04-07',
        poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', media_type: 'tv', adult: false, vote_count: 100,
      }] });
    });
    const provider = createTmdbArtworkProvider(fetcher, 'secret-read-token');
    const artwork = await provider.lookup({ title: 'Attack on Titan', year: 2013, format: 'series' }, signal);

    expect(new URL(requested).pathname).toBe('/3/search/tv');
    expect(new URL(requested).searchParams.get('query')).toBe('Attack on Titan');
    expect(authorization).toBe('Bearer secret-read-token');
    expect(artwork).toEqual({
      tmdbId: 1429, mediaType: 'tv',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      bannerUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
    });
  });

  it('uses the dedicated TV images endpoint when search has no landscape backdrop', async () => {
    const requested: string[] = [];
    const provider = createTmdbArtworkProvider(async (url) => {
      requested.push(url);
      if (new URL(url).pathname === '/3/search/tv') {
        return Response.json({ results: [{ id: 1429, name: 'Attack on Titan', first_air_date: '2013-04-07', poster_path: '/poster.jpg', backdrop_path: null, adult: false }] });
      }
      return Response.json({
        posters: [{ file_path: '/alternate-poster.jpg', iso_639_1: 'en', vote_average: 7.2, vote_count: 20, width: 1000, height: 1500 }],
        backdrops: [{ file_path: '/wide-backdrop.jpg', iso_639_1: null, vote_average: 8.1, vote_count: 40, width: 1920, height: 1080 }],
      });
    }, 'token');

    const artwork = await provider.lookup({ title: 'Attack on Titan', year: 2013 }, signal);
    expect(new URL(requested[1]!).pathname).toBe('/3/tv/1429/images');
    expect(new URL(requested[1]!).searchParams.get('include_image_language')).toBe('en,null');
    expect(artwork?.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(artwork?.bannerUrl).toBe('https://image.tmdb.org/t/p/w1280/wide-backdrop.jpg');
  });

  it('uses movie search for film titles', async () => {
    const requested: string[] = [];
    const provider = createTmdbArtworkProvider(async (url) => {
      requested.push(url);
      return Response.json({ results: [{ id: 99, title: 'Your Name', original_title: '君の名は。', release_date: '2016-08-26', poster_path: '/movie.jpg', backdrop_path: null, adult: false }] });
    }, 'token');
    const artwork = await provider.lookup({ title: 'Your Name', year: 2016, format: 'movie' }, signal);
    expect(new URL(requested[0]!).pathname).toBe('/3/search/movie');
    // Search has no backdrop, so the provider correctly checks the movie images endpoint too.
    expect(new URL(requested[1]!).pathname).toBe('/3/movie/99/images');
    expect(artwork?.posterUrl).toBe('https://image.tmdb.org/t/p/w500/movie.jpg');
    expect(artwork?.bannerUrl).toBeNull();
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
