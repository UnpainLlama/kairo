import { describe, expect, it } from 'vitest';
import {
  cinesrcMovieEmbedUrl,
  cinesrcTvEmbedUrl,
} from './moviePlayback';

describe('CineSrc embed URL builders', () => {
  it('builds the direct movie URL from a TMDB movie ID', () => {
    expect(cinesrcMovieEmbedUrl(1084242)).toBe('https://cinesrc.st/embed/movie/1084242');
  });

  it('builds the documented TV URL with 1-indexed season and episode query parameters', () => {
    expect(cinesrcTvEmbedUrl(1396, 1, 1)).toBe('https://cinesrc.st/embed/tv/1396?s=1&e=1');
  });

  it('accepts string IDs and string season/episode numbers', () => {
    expect(cinesrcTvEmbedUrl('1396', '2', '5')).toBe('https://cinesrc.st/embed/tv/1396?s=2&e=5');
  });

  it.each(['', '0', '-1', 'tt0133097', 'movie-123', '1234567890123'])(
    'rejects an invalid TMDB ID: %s',
    (id) => expect(() => cinesrcMovieEmbedUrl(id)).toThrow(/positive numeric ID/),
  );

  it.each([[0, 1], [1, 0], [-1, 3], ['x', 1]])(
    'rejects invalid TV season and episode values',
    (season, episode) => expect(() => cinesrcTvEmbedUrl(1396, season, episode)).toThrow(/positive numeric ID/),
  );
});
