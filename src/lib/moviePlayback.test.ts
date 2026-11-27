import { describe, expect, it } from 'vitest';
import { cinesrcMovieEmbedUrl } from './moviePlayback';

describe('cinesrcMovieEmbedUrl', () => {
  it('builds the documented movie URL from a TMDB id', () => {
    expect(cinesrcMovieEmbedUrl(786892)).toBe('https://cinesrc.st/embed/movie/786892?autoplay=true&back=close&color=%23e5e5e5');
  });

  it('adds a direct resume timestamp without a continue prompt', () => {
    const url = new URL(cinesrcMovieEmbedUrl(786892, 125));
    expect(url.searchParams.get('t')).toBe('125');
    expect(url.searchParams.get('continueprompt')).toBe('false');
  });

  it('does not add a resume timestamp for a new playback', () => {
    const url = new URL(cinesrcMovieEmbedUrl(786892, 0));
    expect(url.searchParams.has('t')).toBe(false);
    expect(url.searchParams.has('continueprompt')).toBe(false);
  });

  it('accepts a numeric string id', () => {
    expect(cinesrcMovieEmbedUrl(' 550 ')).toContain('/embed/movie/550?');
  });

  it.each(['', '0', '-1', 'tt0133093', 'movie-123', '1234567890123'])(
    'rejects an invalid TMDB id: %s',
    (id) => expect(() => cinesrcMovieEmbedUrl(id)).toThrow(/numeric TMDB id/),
  );
});
