import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readMovieLibrary,
  removeMovieFromLibrary,
  updateMovieLibraryEntry,
} from './movieLibraryStorage';
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

describe('local Movies library', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps guest and account libraries isolated', () => {
    updateMovieLibraryEntry(null, movie, { status: 'watchlist' });
    updateMovieLibraryEntry('account-a', movie, { isFavorite: true });
    updateMovieLibraryEntry('account-b', movie, { status: 'watched' });

    expect(readMovieLibrary(null).map((entry) => entry.status)).toEqual(['watchlist']);
    expect(readMovieLibrary('account-a').map((entry) => [entry.status, entry.isFavorite])).toEqual([[null, true]]);
    expect(readMovieLibrary('account-b').map((entry) => entry.status)).toEqual(['watched']);
  });

  it('updates status and favorites independently and removes empty entries', () => {
    updateMovieLibraryEntry('account-a', movie, { status: 'watchlist' });
    updateMovieLibraryEntry('account-a', movie, { isFavorite: true });
    expect(readMovieLibrary('account-a')[0]).toMatchObject({ status: 'watchlist', isFavorite: true });

    updateMovieLibraryEntry('account-a', movie, { status: 'watched' });
    expect(readMovieLibrary('account-a')[0]).toMatchObject({ status: 'watched', isFavorite: true });

    updateMovieLibraryEntry('account-a', movie, { status: null });
    expect(readMovieLibrary('account-a')[0]).toMatchObject({ status: null, isFavorite: true });

    updateMovieLibraryEntry('account-a', movie, { isFavorite: false });
    expect(readMovieLibrary('account-a')).toEqual([]);
  });

  it('supports explicit removal and ignores malformed stored entries', () => {
    updateMovieLibraryEntry(null, movie, { status: 'watchlist' });
    removeMovieFromLibrary(null, 'tmdb', '550');
    expect(readMovieLibrary(null)).toEqual([]);

    localStorage.setItem('kairo-movies-library:v1:guest', JSON.stringify([{ title: 'broken' }]));
    expect(readMovieLibrary(null)).toEqual([]);
  });

  it('does not throw when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    });
    expect(readMovieLibrary(null)).toEqual([]);
    expect(() => updateMovieLibraryEntry(null, movie, { status: 'watchlist' })).not.toThrow();
  });
});
