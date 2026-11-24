import { describe, expect, it } from 'vitest';
import { isReservedUsername, normalizeUsername, validateUsername } from './username';

describe('Kairo usernames', () => {
  it('normalizes valid ASCII usernames to lowercase', () => {
    expect(normalizeUsername('Kairo.User-01')).toBe('kairo.user-01');
    expect(validateUsername('Member_15')).toEqual({ ok: true, username: 'member_15' });
  });

  it('accepts only ASCII letters, digits, underscore, dot and hyphen at 3–32 characters', () => {
    for (const invalid of ['', 'ab', 'a'.repeat(33), 'has space', 'ümlaut', 'a@b', 'a/b', ' auser']) {
      expect(normalizeUsername(invalid)).toBeNull();
    }
    expect(normalizeUsername('abc')).toBe('abc');
    expect(normalizeUsername('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it('reserves system names and legacy username prefixes case-insensitively', () => {
    for (const reserved of ['root', 'SYSTEM', 'support', 'Kairo', 'access_olduser', 'user_abcdef']) {
      const result = validateUsername(reserved);
      expect(result).toMatchObject({ ok: false, reason: 'reserved' });
      expect(isReservedUsername(reserved.toLowerCase())).toBe(true);
    }
    expect(validateUsername('rooted')).toMatchObject({ ok: true });
    expect(validateUsername('accessory')).toMatchObject({ ok: true });
  });
});
