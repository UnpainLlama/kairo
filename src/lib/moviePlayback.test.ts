import { describe, expect, it } from 'vitest';
import { cinesrcMovieEmbedUrl } from './moviePlayback';

describe('cinesrcMovieEmbedUrl', () => {
  it('builds the documented movie URL from a TMDB id', () => {
    expect(cinesrcMovieEmbedUrl(786892)).toBe('https://cinesrc.st/embed/movie/786892?autoplay=true&back=close&color=%23e5e5e5');
  });

  it('accepts a numeric string id', () => {
    expect(cinesrcMovieEmbedUrl(' 550 ')).toContain('/embed/movie/550?');
  });

  it('adds the resume time and preferred source when available', () => {
    const url = new URL(cinesrcMovieEmbedUrl(550, { startSeconds: 321.8, sourceId: 'server_1' }));
    expect(url.searchParams.get('t')).toBe('321');
    expect(url.searchParams.get('continueprompt')).toBe('false');
    expect(url.searchParams.get('lastserver')).toBe('server_1');
  });

  it('does not add a resume prompt for an unwatched title or unsafe source id', () => {
    const url = new URL(cinesrcMovieEmbedUrl(550, { startSeconds: 5, sourceId: '../bad' }));
    expect(url.searchParams.has('t')).toBe(false);
    expect(url.searchParams.has('lastserver')).toBe(false);
  });

  it.each(['', '0', '-1', 'tt0133093', 'movie-123', '1234567890123'])(
    'rejects an invalid TMDB id: %s',
    (id) => expect(() => cinesrcMovieEmbedUrl(id)).toThrow(/numeric TMDB id/),
  );
});
