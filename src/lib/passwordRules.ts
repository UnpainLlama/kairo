const MAX_PASSWORD_BYTES = 1024;

export function isPasswordAllowed(password: string, username: string): boolean {
  if (typeof password !== 'string' || typeof username !== 'string') return false;
  if (Array.from(password).length < 15) return false;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return false;
  return password.toLocaleLowerCase('en-US') !== username.toLocaleLowerCase('en-US');
}
