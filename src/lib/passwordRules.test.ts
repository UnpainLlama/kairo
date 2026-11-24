import { describe, expect, it } from 'vitest';
import { isPasswordAllowed } from './passwordRules';

describe('client password rules', () => {
  it('requires at least five whitespace-separated words', () => {
    expect(isPasswordAllowed('one two three four', 'admin')).toBe(false);
    expect(isPasswordAllowed('one two three four five', 'admin')).toBe(true);
    expect(isPasswordAllowed(' one  two   three four five ', 'admin')).toBe(true);
  });

  it('enforces the UTF-8 byte ceiling', () => {
    expect(isPasswordAllowed('a '.repeat(512), 'admin')).toBe(true);
    expect(isPasswordAllowed('a '.repeat(513), 'admin')).toBe(false);
    expect(isPasswordAllowed('😀 '.repeat(205), 'admin')).toBe(false);
  });

  it('does not allow a password identical to the username, ignoring case', () => {
    expect(isPasswordAllowed('Admin.User', 'admin.user')).toBe(false);
    expect(isPasswordAllowed('a different long passphrase', 'admin.user')).toBe(true);
  });
});
