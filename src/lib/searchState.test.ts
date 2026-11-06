import { describe, it, expect } from 'vitest';
import { parseSearchState, toApiPath, toUrlParams, canSearch } from './searchState';

describe('searchState', () => {
  it('parses valid values and drops invalid ones', () => {
    const s = parseSearchState(new URLSearchParams('q=naruto&format=MOVIE&sort=bogus&page=0'));
    expect(s).toEqual({ q: 'naruto', genre: '', format: 'movie', sort: 'relevance', page: 1 });
  });
  it('omits defaults from the URL', () => {
    const p = toUrlParams({ q: 'abc', genre: '', format: '', sort: 'relevance', page: 1 });
    expect(p.toString()).toBe('q=abc');
  });
  it('round-trips non-default values', () => {
    const state = { q: 'one piece', genre: 'Action', format: 'series' as const, sort: 'rating' as const, page: 3 };
    expect(parseSearchState(toUrlParams(state))).toEqual(state);
  });
  it('does not build an API path for queries under 2 characters', () => {
    expect(canSearch(' a ')).toBe(false);
    expect(toApiPath({ q: 'a', genre: '', format: '', sort: 'relevance', page: 1 })).toBeNull();
  });
  it('builds an encoded API path', () => {
    const path = toApiPath({ q: 'a&b', genre: 'Sci-Fi', format: 'ova', sort: 'latest', page: 2 });
    expect(path).toBe('/catalog/search?q=a%26b&page=2&limit=24&sort=latest&genre=Sci-Fi&format=ova');
  });
});
