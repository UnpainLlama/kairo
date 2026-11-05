import { describe, it, expect } from 'vitest';
import { parseSearchParams, parsePagination } from '../lib/validation';
import { buildSearchQuery, buildListQuery, buildRelatedQuery, GENRES_SQL } from './catalog';

const search = (q: Record<string, string>) => {
  const parsed = parseSearchParams(q);
  if (!parsed.ok) throw new Error(parsed.message);
  return buildSearchQuery(parsed.value);
};

describe('buildSearchQuery', () => {
  it('binds user text instead of interpolating it', () => {
    const built = search({ q: "x'; DROP TABLE anime; --" });
    expect(built.sql).not.toContain('DROP');
    expect(built.binds).toEqual(["%x'; DROP TABLE anime; --%", "%x'; DROP TABLE anime; --%", 24, 0]);
  });
  it('escapes LIKE wildcards so they match literally', () => {
    expect(search({ q: '100%_' }).binds.slice(0, 2)).toEqual(['%100\\%\\_%', '%100\\%\\_%']);
  });
  it('adds one bound condition per filter, in a fixed order', () => {
    const built = search({ q: 'moon', genre: 'Sci-Fi', year: '2026', format: 'MOVIE', status: 'airing', season: 'Fall' });
    expect(built.sql).toContain('genres_json LIKE ?');
    expect(built.sql).toContain('release_year = ?');
    expect(built.sql).toContain('LOWER(format) = ?');
    expect(built.binds).toEqual(['%moon%', '%moon%', '%"Sci-Fi"%', 2026, 'movie', 'airing', 'fall', 24, 0]);
    expect(built.countBinds).toEqual(['%moon%', '%moon%', '%"Sci-Fi"%', 2026, 'movie', 'airing', 'fall']);
  });
  it('orders only by whitelisted fragments and applies the offset', () => {
    expect(search({ q: 'moon', sort: 'rating' }).sql).toContain('ORDER BY rating IS NULL, rating DESC');
    expect(search({ q: 'moon', sort: 'latest' }).sql).toContain('ORDER BY updated_at DESC');
    expect(search({ q: 'moon', page: '3', limit: '10' }).binds.slice(-2)).toEqual([10, 20]);
  });
});

describe('buildListQuery', () => {
  const page = parsePagination({ page: '2', limit: '5' });
  it('ranks trending by popularity and latest by update time', () => {
    if (!page.ok) throw new Error('bad pagination');
    expect(buildListQuery('trending', page.value).sql).toContain('ORDER BY popularity_score DESC');
    expect(buildListQuery('latest', page.value).sql).toContain('ORDER BY updated_at DESC');
    expect(buildListQuery('latest', page.value).binds).toEqual([5, 5]);
  });
});

describe('genres and related', () => {
  it('skips malformed genre JSON instead of failing the whole query', () => {
    expect(GENRES_SQL).toContain('json_valid');
  });
  it('binds the source id, genre list and limit', () => {
    const built = buildRelatedQuery('a1', ['Adventure', 'Fantasy'], 12);
    expect(built.binds).toEqual(['a1', '["Adventure","Fantasy"]', 12]);
    expect(built.sql).toContain('a.id != ?');
  });
});
