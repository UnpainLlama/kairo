import { describe, expect, it } from 'vitest';
import { isPasswordAllowed } from './passwordRules';

describe('client password rules', () => {
  it('requires at least 15 Unicode code points', () => {
    expect(isPasswordAllowed('a'.repeat(14), 'admin')).toBe(false);
    expect(isPasswordAllowed('a'.repeat(15), 'admin')).toBe(true);
    expect(isPasswordAllowed('😀'.repeat(15), 'admin')).toBe(true);
  });

  it('enforces the UTF-8 byte ceiling', () => {
    expect(isPasswordAllowed('a'.repeat(1024), 'admin')).toBe(true);
    expect(isPasswordAllowed('a'.repeat(1025), 'admin')).toBe(false);
    expect(isPasswordAllowed('😀'.repeat(257), 'admin')).toBe(false);
  });

  it('does not allow a password identical to the username, ignoring case', () => {
    expect(isPasswordAllowed('Admin.User', 'admin.user')).toBe(false);
    expect(isPasswordAllowed('a different long passphrase', 'admin.user')).toBe(true);
  });
});
