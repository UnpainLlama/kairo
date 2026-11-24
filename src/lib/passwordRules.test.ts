import { describe, expect, it } from 'vitest';
import { isPasswordAllowed, validatePasswordChange } from './passwordRules';

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
    expect(isPasswordAllowed('a different and much longer passphrase', 'admin.user')).toBe(true);
  });
});

describe('password-change form validation', () => {
  const base = {
    currentPassword: 'password',
    newPassword: 'river mountain silver lantern meadow',
    confirmation: 'river mountain silver lantern meadow',
    username: 'admin',
  };

  it('accepts a valid five-word passphrase read from the submitted form', () => {
    expect(validatePasswordChange(base)).toBeNull();
  });

  it('reports the actual word count instead of a generic validation error', () => {
    expect(validatePasswordChange({
      ...base,
      newPassword: 'river mountain',
      confirmation: 'river mountain',
    })).toEqual({
      field: 'newPassword',
      message: 'Kairo counted 2 words in the new passphrase. Add 3 more words, separated by spaces.',
    });
  });

  it('counts repeated and leading whitespace without changing the password value', () => {
    expect(validatePasswordChange({
      ...base,
      newPassword: '  river   mountain silver lantern meadow  ',
      confirmation: '  river   mountain silver lantern meadow  ',
    })).toBeNull();
  });

  it('reports missing temporary password', () => {
    expect(validatePasswordChange({ ...base, currentPassword: '' })?.field).toBe('currentPassword');
  });

  it('reports missing and mismatched confirmation separately', () => {
    expect(validatePasswordChange({ ...base, confirmation: '' })?.message).toBe('Confirm your new passphrase.');
    expect(validatePasswordChange({ ...base, confirmation: 'another different phrase' })?.message)
      .toContain('do not match');
  });

  it('rejects a passphrase equal to the username, ignoring case', () => {
    expect(validatePasswordChange({
      ...base,
      newPassword: 'ADMIN',
      confirmation: 'ADMIN',
    })?.message).toBe('Your new passphrase must be different from your username.');
  });

  it('rejects reusing the temporary password', () => {
    expect(validatePasswordChange({
      ...base,
      newPassword: 'password',
      confirmation: 'password',
    })?.message).toBe('Kairo counted 1 word in the new passphrase. Add 4 more words, separated by spaces.');
  });

  it('enforces the 1,024-byte maximum with a specific diagnostic', () => {
    const longPassword = 'word '.repeat(205);
    const issue = validatePasswordChange({
      ...base,
      newPassword: longPassword,
      confirmation: longPassword,
    });
    expect(issue?.message).toContain('UTF-8 bytes');
    expect(issue?.message).toContain('1,024 bytes');
  });
});
