import { describe, expect, it } from 'vitest';
import { vidlinkMovieEmbedUrl } from './moviePlayback';

describe('vidlinkMovieEmbedUrl', () => {
  it('builds the official default movie URL from a TMDB id', () => {
    expect(vidlinkMovieEmbedUrl(786892)).toBe('https://vidlink.pro/movie/786892');
  });

  it('supports VidLink’s documented JW player option', () => {
    expect(vidlinkMovieEmbedUrl('786892', 'jw')).toBe('https://vidlink.pro/movie/786892?player=jw');
  });

  it.each(['', '0', '-1', 'tt0133093', 'movie-123', '1234567890123'])(
    'rejects an invalid TMDB id: %s',
    (id) => expect(() => vidlinkMovieEmbedUrl(id)).toThrow(/numeric TMDB id/),
  );
});
