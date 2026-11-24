const MAX_PASSWORD_BYTES = 1024;

export type PasswordChangeValues = {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
  username: string;
};

export type PasswordChangeValidationError = {
  field: 'currentPassword' | 'newPassword' | 'confirmPassword';
  message: string;
};

/**
 * Validate the exact values submitted by the password form.
 * Values are intentionally not trimmed before hashing: leading/trailing spaces
 * remain part of the chosen password. Trimming is used only to count words.
 */
export function validatePasswordChange(values: PasswordChangeValues): PasswordChangeValidationError | null {
  const { currentPassword, newPassword, confirmation, username } = values;

  if (!currentPassword) {
    return { field: 'currentPassword', message: 'Enter the temporary password provided for this account.' };
  }
  if (!newPassword) {
    return { field: 'newPassword', message: 'Enter a new passphrase.' };
  }

  const passwordBytes = new TextEncoder().encode(newPassword).length;
  if (passwordBytes > MAX_PASSWORD_BYTES) {
    return {
      field: 'newPassword',
      message: 'Your new passphrase is too long (' + passwordBytes + ' UTF-8 bytes). The maximum is 1,024 bytes.',
    };
  }

  const wordCount = newPassword.trim().split(/\s+/u).filter(Boolean).length;
  if (wordCount < 5) {
    const remaining = 5 - wordCount;
    return {
      field: 'newPassword',
      message: 'Kairo counted ' + wordCount + ' ' + (wordCount === 1 ? 'word' : 'words') +
        ' in the new passphrase. Add ' + remaining + ' more ' + (remaining === 1 ? 'word' : 'words') +
        ', separated by spaces.',
    };
  }

  if (newPassword.toLocaleLowerCase('en-US') === username.toLocaleLowerCase('en-US')) {
    return { field: 'newPassword', message: 'Your new passphrase must be different from your username.' };
  }
  if (newPassword === currentPassword) {
    return { field: 'newPassword', message: 'Your new passphrase must be different from the temporary password.' };
  }
  if (!confirmation) {
    return { field: 'confirmPassword', message: 'Confirm your new passphrase.' };
  }
  if (newPassword !== confirmation) {
    return { field: 'confirmPassword', message: 'The new passphrases do not match. Check both fields and try again.' };
  }

  return null;
}

/** Kept as a small reusable rule for other UI callers and existing tests. */
export function isPasswordAllowed(password: string, username: string): boolean {
  if (typeof password !== 'string' || typeof username !== 'string') return false;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return false;
  if (password.trim().split(/\s+/u).filter(Boolean).length < 5) return false;
  return password.toLocaleLowerCase('en-US') !== username.toLocaleLowerCase('en-US');
}
