import { describe, it, expect } from 'vitest';
import { normalizeFormat, normalizeStatus, normalizeSeason, ratingFrom100, plainText, titleKey, uniqueStrings, httpsUrlOrNull } from './normalize';

describe('normalize', () => {
  it('maps each provider vocabulary onto KAIRO enums', () => {
    expect(['TV', 'TV_SHORT', 'movie', 'OVA', 'ONA', 'SPECIAL', 'MUSIC', 'weird'].map(normalizeFormat)).toEqual(['series', 'series', 'movie', 'ova', 'ona', 'special', null, null]);
    expect(['RELEASING', 'current', 'ONGOING', 'NOT_YET_RELEASED', 'tba', 'FINISHED', 'HIATUS', 'CANCELLED', 'UNKNOWN'].map(normalizeStatus))
      .toEqual(['airing', 'airing', 'airing', 'upcoming', 'upcoming', 'finished', 'hiatus', null, null]);
    expect(['FALL', 'autumn', 'Winter', 'x'].map(normalizeSeason)).toEqual(['fall', 'fall', 'winter', null]);
  });
  it("round-trips KAIRO's own stored values unchanged", () => {
    expect(['series', 'movie', 'ova', 'ona', 'special'].map(normalizeFormat)).toEqual(['series', 'movie', 'ova', 'ona', 'special']);
    expect(['airing', 'finished', 'upcoming', 'hiatus'].map(normalizeStatus)).toEqual(['airing', 'finished', 'upcoming', 'hiatus']);
    expect(['winter', 'spring', 'summer', 'fall'].map(normalizeSeason)).toEqual(['winter', 'spring', 'summer', 'fall']);
  });
  it('converts 0-100 scores to 0-10 and rejects out-of-range values', () => {
    expect(ratingFrom100(82)).toBe(8.2);
    expect(ratingFrom100('84.06')).toBe(8.4);
    expect([0, -5, 101, 'abc', null].map(ratingFrom100)).toEqual([null, null, null, null, null]);
  });
  it('strips HTML from synopses and decodes entities', () => {
    expect(plainText('A <b>bold</b> start<br>Second &amp; last<script>x</script>')).toBe('A bold start\nSecond & lastx');
    expect(plainText('   ')).toBeNull();
    expect(plainText(5)).toBeNull();
  });
  it('builds comparable title keys', () => {
    expect(titleKey('Fullmetal Alchemist: Brotherhood!')).toBe(titleKey('fullmetal  alchemist brotherhood'));
    expect(titleKey('ＤＥＡＴＨ　ＮＯＴＥ')).toBe('death note');
  });
  it('dedupes case-insensitively and only accepts https URLs', () => {
    expect(uniqueStrings(['Action', 'action', ' ', 'Drama', 3])).toEqual(['Action', 'Drama']);
    expect(httpsUrlOrNull('http://x.test/a.jpg')).toBeNull();
    expect(httpsUrlOrNull('javascript:alert(1)')).toBeNull();
    expect(httpsUrlOrNull('https://x.test/a.jpg')).toBe('https://x.test/a.jpg');
  });
});
