import { describe, expect, it } from 'vitest';
import {
  embedWaveMovieEmbedUrl,
  embedWaveTvEmbedUrl,
} from './moviePlayback';

describe('EmbedWave embed URL builders', () => {
  it('builds the documented movie URL from a TMDB movie ID', () => {
    expect(embedWaveMovieEmbedUrl(533535)).toBe('https://embedwave.cc/embed/movie/533535');
  });

  it('pins a selected movie server only when requested', () => {
    expect(embedWaveMovieEmbedUrl('533535', 'cinesrc')).toBe(
      'https://embedwave.cc/embed/movie/533535?server=cinesrc',
    );
  });

  it('builds the documented TV URL with 1-indexed season and episode numbers', () => {
    expect(embedWaveTvEmbedUrl(1399, 1, 1)).toBe('https://embedwave.cc/embed/tv/1399/1/1');
  });

  it('supports pinning a TV episode to a selected server', () => {
    expect(embedWaveTvEmbedUrl('1399', '2', '5', 'videasy')).toBe(
      'https://embedwave.cc/embed/tv/1399/2/5?server=videasy',
    );
  });

  it.each(['', '0', '-1', 'tt0133093', 'movie-123', '1234567890123'])(
    'rejects an invalid TMDB ID: %s',
    (id) => expect(() => embedWaveMovieEmbedUrl(id)).toThrow(/positive numeric ID/),
  );

  it.each([[0, 1], [1, 0], [-1, 3], ['x', 1]])(
    'rejects invalid TV season and episode values',
    (season, episode) => expect(() => embedWaveTvEmbedUrl(1399, season, episode)).toThrow(/positive numeric ID/),
  );
});
