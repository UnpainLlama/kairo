import { describe, it, expect } from 'vitest';
import { boundedInt, parseId, parsePagination, parseSearchParams, parseLibraryBody, parseProgressBody, SORT_ORDER_BY } from './validation';

describe('boundedInt', () => {
  it('uses the fallback when absent and accepts in-range integers', () => {
    expect(boundedInt(undefined, 24, 1, 50)).toBe(24);
    expect(boundedInt('50', 24, 1, 50)).toBe(50);
  });
  it('rejects out-of-range, fractional, signed, hex and exponent input', () => {
    for (const bad of ['0', '51', '1.5', '-1', '0x10', '1e1', ' 5', 'abc']) expect(boundedInt(bad, 24, 1, 50)).toBeNull();
  });
});

describe('parseId', () => {
  it('accepts ids and slugs, rejects separators and overlong values', () => {
    expect(parseId('afterglow-atlas')).toBe('afterglow-atlas');
    expect(parseId('a/../b')).toBeNull();
    expect(parseId('x'.repeat(129))).toBeNull();
    expect(parseId(undefined)).toBeNull();
  });
});

describe('parsePagination', () => {
  it('defaults to page 1 / limit 24 and computes offset', () => {
    expect(parsePagination({})).toEqual({ ok: true, value: { page: 1, limit: 24, offset: 0 } });
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ ok: true, value: { page: 3, limit: 10, offset: 20 } });
  });
  it('enforces server-side bounds', () => {
    expect(parsePagination({ page: '501' }).ok).toBe(false);
    expect(parsePagination({ limit: '51' }).ok).toBe(false);
    expect(parsePagination({ limit: '100' }, { maxLimit: 100 }).ok).toBe(true);
  });
});

describe('parseSearchParams', () => {
  it('requires a trimmed 2–100 character query', () => {
    expect(parseSearchParams({ q: ' a ' }).ok).toBe(false);
    expect(parseSearchParams({ q: 'x'.repeat(101) }).ok).toBe(false);
    const r = parseSearchParams({ q: '  moon  ' });
    expect(r.ok && r.value.q).toBe('moon');
  });
  it('rejects unknown sort keys instead of passing them toward SQL', () => {
    expect(parseSearchParams({ q: 'moon', sort: 'title; DROP TABLE anime' }).ok).toBe(false);
    expect(Object.keys(SORT_ORDER_BY).sort()).toEqual(['latest', 'popularity', 'rating', 'relevance', 'trending']);
    expect(parseSearchParams({ q: 'moon', sort: 'trending' }).ok).toBe(true);
  });
  it('normalises valid filters and rejects invalid ones', () => {
    const r = parseSearchParams({ q: 'moon', format: 'MOVIE', season: 'Fall', year: '2026', genre: 'Sci-Fi', status: 'airing' });
    expect(r.ok && r.value).toMatchObject({ format: 'movie', season: 'fall', year: 2026, genre: 'Sci-Fi', status: 'airing', sort: 'relevance' });
    expect(parseSearchParams({ q: 'moon', year: '1800' }).ok).toBe(false);
    expect(parseSearchParams({ q: 'moon', format: 'film' }).ok).toBe(false);
    expect(parseSearchParams({ q: 'moon', genre: "x' OR 1=1 --" }).ok).toBe(false);
  });
});

describe('parseLibraryBody', () => {
  it('accepts a valid status with optional favorite flag', () => {
    expect(parseLibraryBody({ status: 'watching', isFavorite: true })).toEqual({ ok: true, value: { status: 'watching', isFavorite: true } });
  });
  it('rejects bad status, wrong types, non-objects, and unknown fields such as userId', () => {
    expect(parseLibraryBody({ status: 'binged' }).ok).toBe(false);
    expect(parseLibraryBody({ status: 'dropped', isFavorite: 'yes' }).ok).toBe(false);
    expect(parseLibraryBody({ status: 'dropped', userId: 'u2' }).ok).toBe(false);
    expect(parseLibraryBody(null).ok).toBe(false);
    expect(parseLibraryBody([]).ok).toBe(false);
  });
});

describe('parseProgressBody', () => {
  it('accepts the documented example', () => {
    expect(parseProgressBody({ positionSeconds: 523, durationSeconds: 1420, completed: false })).toEqual({
      ok: true, value: { positionSeconds: 523, durationSeconds: 1420, completed: false },
    });
  });
  it('allows unknown duration and defaults completed to false', () => {
    expect(parseProgressBody({ positionSeconds: 10 })).toEqual({ ok: true, value: { positionSeconds: 10, durationSeconds: null, completed: false } });
  });
  it('rejects negative, non-finite, oversized, and string numbers', () => {
    for (const positionSeconds of [-1, Infinity, NaN, 86_401, '5']) expect(parseProgressBody({ positionSeconds }).ok).toBe(false);
  });
  it('rejects position past duration (beyond 5s tolerance) and client-supplied userId', () => {
    expect(parseProgressBody({ positionSeconds: 1000, durationSeconds: 900 }).ok).toBe(false);
    expect(parseProgressBody({ positionSeconds: 903, durationSeconds: 900 }).ok).toBe(true);
    expect(parseProgressBody({ positionSeconds: 1, userId: 'someone-else' }).ok).toBe(false);
  });
});
