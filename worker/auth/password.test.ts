import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  isNewPasswordValid,
  isPasswordDifferentFromUsername,
  needsRehash,
  PASSWORD_HASH_ITERATIONS,
  PASSWORD_HASH_VERSION,
  verifyPassword,
} from './password';

const LEGACY_V1_HASH = 'pbkdf2-sha256$v=1$i=100000$EREREREREREREREREREREQ$E50SbclUI_yn06RaRFL8vA6GeI9RLiXdeiIwe1jkV4Y';

describe('password hashing', () => {
  it('creates versioned PBKDF2-SHA256 hashes with unique salts', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');
    expect(first).toMatch(/^pbkdf2-sha256\$v=2\$i=100000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(PASSWORD_HASH_ITERATIONS).toBe(100_000);
    expect(PASSWORD_HASH_VERSION).toBe(2);
    expect(await verifyPassword('correct horse battery staple', first)).toBe(true);
    expect(await verifyPassword('different password', first)).toBe(false);
    expect(needsRehash(first)).toBe(false);
  });

  it('verifies allowlisted v1 hashes and marks them for rehash after successful login', async () => {
    expect(await verifyPassword('correct horse battery staple', LEGACY_V1_HASH)).toBe(true);
    expect(needsRehash(LEGACY_V1_HASH)).toBe(true);
    expect(await verifyPassword('wrong password', LEGACY_V1_HASH)).toBe(false);
  });

  it('rejects malformed, unsupported and attacker-selected work factors', async () => {
    expect(await verifyPassword('password', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('password', 'pbkdf2-sha256$v=3$i=100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
    expect(await verifyPassword('password', 'pbkdf2-sha256$v=1$i=999999999$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
    expect(needsRehash('not-a-hash')).toBe(false);
  });

  it('rejects empty and excessively long passwords', async () => {
    await expect(hashPassword('')).rejects.toThrow(RangeError);
    await expect(hashPassword('a'.repeat(1025))).rejects.toThrow(RangeError);
    expect(await verifyPassword('', 'malformed')).toBe(false);
  });

  it('requires at least five words and enforces the UTF-8 byte ceiling', () => {
    expect(isNewPasswordValid('one two three four')).toBe(false);
    expect(isNewPasswordValid('one two three four five')).toBe(true);
    expect(isNewPasswordValid(' one  two   three four five ')).toBe(true);
    expect(isNewPasswordValid('😀 😀 😀 😀 😀')).toBe(true);
    expect(isNewPasswordValid('a '.repeat(512))).toBe(true);
    expect(isNewPasswordValid('a '.repeat(513))).toBe(false);
    expect(isNewPasswordValid(null)).toBe(false);
    expect(isPasswordDifferentFromUsername('myusernamepassword', 'myusername')).toBe(true);
    expect(isPasswordDifferentFromUsername('myusername', 'MYUSERNAME')).toBe(false);
  });
});
