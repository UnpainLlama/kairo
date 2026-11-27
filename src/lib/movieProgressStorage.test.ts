import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readMovieProgress, removeMovieProgress, writeMovieProgress } from './movieProgressStorage';
import type { MovieSummary } from './movies';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const movie: MovieSummary = {
  providerId: 'tmdb',
  externalId: '550',
  title: 'Fight Club',
  originalTitle: 'Fight Club',
  overview: 'A film about an underground fight club.',
  releaseDate: '1999-10-15',
  releaseYear: 1999,
  originalLanguage: 'en',
  posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
  voteAverage: 8.4,
  voteCount: 25000,
  popularity: 80,
  adult: false,
};

describe('local Movies playback progress', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps guest and account progress isolated', () => {
    writeMovieProgress(null, movie, { currentTime: 120, duration: 7200, completed: false, updatedAt: 1000 });
    writeMovieProgress('account-a', movie, { currentTime: 360, duration: 7200, completed: false, updatedAt: 2000 });

    expect(readMovieProgress(null)[0].watchProgress.currentTime).toBe(120);
    expect(readMovieProgress('account-a')[0].watchProgress.currentTime).toBe(360);
    expect(readMovieProgress('account-b')).toEqual([]);
  });

  it('stores completed titles at the end of their duration', () => {
    const entry = writeMovieProgress('account-a', movie, {
      currentTime: 7000, duration: 7200, completed: true, updatedAt: 3000,
    });
    expect(entry.watchProgress).toMatchObject({ currentTime: 7200, duration: 7200, completed: true });
  });

  it('updates existing progress and supports removal', () => {
    writeMovieProgress(null, movie, { currentTime: 100, duration: 7200, completed: false, updatedAt: 1000 });
    writeMovieProgress(null, movie, { currentTime: 220, duration: 7200, completed: false, updatedAt: 2000 });
    expect(readMovieProgress(null)).toHaveLength(1);
    expect(readMovieProgress(null)[0].watchProgress.currentTime).toBe(220);

    removeMovieProgress(null, 'tmdb', '550');
    expect(readMovieProgress(null)).toEqual([]);
  });

  it('does not throw when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    });
    expect(readMovieProgress(null)).toEqual([]);
    expect(() => writeMovieProgress(null, movie, {
      currentTime: 5, duration: 7200, completed: false, updatedAt: 1000,
    })).not.toThrow();
  });
});
