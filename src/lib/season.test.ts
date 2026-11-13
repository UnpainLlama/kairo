import { describe, expect, it } from 'vitest';
import { currentAnimeSeason } from './season';

describe('currentAnimeSeason', () => {
  it.each([
    ['2026-01-01T00:00:00Z', { season: 'winter', year: 2026 }],
    ['2026-03-31T23:59:59Z', { season: 'winter', year: 2026 }],
    ['2026-04-01T00:00:00Z', { season: 'spring', year: 2026 }],
    ['2026-06-30T23:59:59Z', { season: 'spring', year: 2026 }],
    ['2026-07-01T00:00:00Z', { season: 'summer', year: 2026 }],
    ['2026-09-30T23:59:59Z', { season: 'summer', year: 2026 }],
    ['2026-10-01T00:00:00Z', { season: 'fall', year: 2026 }],
    ['2026-12-31T23:59:59Z', { season: 'fall', year: 2026 }],
  ])('maps %s to the correct season', (value, expected) => {
    expect(currentAnimeSeason(new Date(value))).toEqual(expected);
  });
});
