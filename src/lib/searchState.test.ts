import { describe, it, expect } from 'vitest';
import { EMPTY_SEARCH, parseSearchState, toApiPath, toUrlParams, canSearch, hasFilters } from './searchState';

describe('searchState', () => {
  it('parses valid values and drops invalid ones', () => {
    const s = parseSearchState(new URLSearchParams('q=naruto&format=MOVIE&sort=bogus&page=0&status=nope&year=3000'));
    expect(s).toEqual({ ...EMPTY_SEARCH, q: 'naruto', format: 'movie' });
  });
  it('omits defaults from the URL', () => {
    expect(toUrlParams({ ...EMPTY_SEARCH, q: 'abc' }).toString()).toBe('q=abc');
  });
  it('round-trips non-default values', () => {
    const state = { q: 'one piece', genre: 'Action', format: 'series' as const, status: 'airing' as const, year: 2024, sort: 'rating' as const, page: 3 };
    expect(parseSearchState(toUrlParams(state))).toEqual(state);
  });
  it('uses browse, without q, when the title text is under 2 characters', () => {
    expect(canSearch(' a ')).toBe(false);
    expect(toApiPath({ ...EMPTY_SEARCH, q: 'a' })).toBe('/catalog/browse?page=1&limit=24&sort=popularity');
  });
  it('uses search with relevance by default when there is a title query', () => {
    expect(toApiPath({ ...EMPTY_SEARCH, q: 'naruto' })).toBe('/catalog/search?q=naruto&page=1&limit=24&sort=relevance');
  });
  it('builds an encoded API path with every filter', () => {
    const path = toApiPath({ q: 'a&b', genre: 'Sci-Fi', format: 'ova', status: 'finished', year: 2019, sort: 'latest', page: 2 });
    expect(path).toBe('/catalog/search?q=a%26b&page=2&limit=24&sort=latest&genre=Sci-Fi&format=ova&status=finished&year=2019');
  });
  it('browses by filters alone', () => {
    expect(toApiPath({ ...EMPTY_SEARCH, genre: 'Comedy', status: 'airing' })).toBe('/catalog/browse?page=1&limit=24&sort=popularity&genre=Comedy&status=airing');
  });
  it('reports whether any filter is set', () => {
    expect(hasFilters(EMPTY_SEARCH)).toBe(false);
    expect(hasFilters({ ...EMPTY_SEARCH, year: 2020 })).toBe(true);
  });
});
