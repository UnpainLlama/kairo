import { describe, expect, it } from 'vitest';
import { vidlinkMovieEmbedUrl } from './moviePlayback';

describe('vidlinkMovieEmbedUrl', () => {
  it('builds the official default movie URL from a TMDB id', () => {
    expect(vidlinkMovieEmbedUrl(786892)).toBe('https://vidlink.pro/movie/786892');
  });

  it('supports VidLink’s documented JW player option', () => {
    expect(vidlinkMovieEmbedUrl('786892', 'jw')).toBe('https://vidlink.pro/movie/786892?player=jw');
  });

  it('adds VidLink startAt when resuming a saved position', () => {
    expect(vidlinkMovieEmbedUrl('786892', 'default', 372)).toBe('https://vidlink.pro/movie/786892?startAt=372');
  });

  it('preserves the JW player option when adding a resume position', () => {
    expect(vidlinkMovieEmbedUrl('786892', 'jw', 372)).toBe('https://vidlink.pro/movie/786892?player=jw&startAt=372');
  });

  it('ignores invalid or negative resume positions', () => {
    expect(vidlinkMovieEmbedUrl('786892', 'default', -1)).toBe('https://vidlink.pro/movie/786892');
  });

  it.each(['', '0', '-1', 'tt0133093', 'movie-123', '1234567890123'])(
    'rejects an invalid TMDB id: %s',
    (id) => expect(() => vidlinkMovieEmbedUrl(id)).toThrow(/numeric TMDB id/),
  );
});
