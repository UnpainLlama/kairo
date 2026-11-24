import { describe, expect, it } from 'vitest';
import {
  buildAdminPasswordSql,
  createPasswordHash,
  isValidPassword,
  normalizeUsername,
} from './set-admin-password.mjs';

describe('offline admin password enrolment script', () => {
  it('generates a v2 PBKDF2 hash and never puts the plaintext into the SQL', () => {
    const password = 'a secure admin passphrase';
    const username = 'site.admin';
    const hash = createPasswordHash(password, Buffer.alloc(16, 7));
    expect(hash).toMatch(/^pbkdf2-sha256\$v=2\$i=100000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    const sql = buildAdminPasswordSql('admin-profile-id', username, hash);
    expect(sql).toContain("role='admin' AND account_status='active'");
    expect(sql).toContain('must_change_password');
    expect(sql).toContain('DELETE FROM sessions WHERE user_id=');
    expect(sql).toContain('remaining_sessions');
    expect(sql).toContain(hash);
    expect(sql).not.toContain(password);
  });

  it('normalizes names and rejects invalid/reserved usernames', () => {
    expect(normalizeUsername('Admin.User')).toBe('admin.user');
    expect(normalizeUsername('access_legacy')).toBeNull();
    expect(normalizeUsername('root')).toBeNull();
    expect(normalizeUsername('has space')).toBeNull();
  });

  it('validates password length and rejects password equal to username', () => {
    expect(isValidPassword('a sufficiently long password', 'admin')).toBe(true);
    expect(isValidPassword('short', 'admin')).toBe(false);
    expect(isValidPassword('Site.Admin', 'site.admin')).toBe(false);
  });
});
