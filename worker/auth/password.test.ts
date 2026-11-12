import { describe, expect, it } from 'vitest';
import { hashPassword, PASSWORD_HASH_ITERATIONS, verifyPassword } from './password';

describe('password hashing', () => {
  it('uses versioned PBKDF2-SHA256 hashes with unique salts', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');
    expect(first).toMatch(/^pbkdf2-sha256\$v=1\$i=600000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(PASSWORD_HASH_ITERATIONS).toBe(600_000);
    expect(await verifyPassword('correct horse battery staple', first)).toBe(true);
    expect(await verifyPassword('different password', first)).toBe(false);
  });

  it('rejects malformed, unsupported and attacker-selected work factors', async () => {
    expect(await verifyPassword('password', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('password', 'pbkdf2-sha256$v=2$i=600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
    expect(await verifyPassword('password', 'pbkdf2-sha256$v=1$i=999999999$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
  });

  it('rejects empty and excessively long passwords', async () => {
    await expect(hashPassword('')).rejects.toThrow(RangeError);
    await expect(hashPassword('a'.repeat(1025))).rejects.toThrow(RangeError);
    expect(await verifyPassword('', 'malformed')).toBe(false);
  });
});
