const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
const RESERVED_NAMES = new Set(['root', 'system', 'support', 'kairo']);

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; reason: 'invalid' | 'reserved' };

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string' || !USERNAME_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_NAMES.has(username) ||
    username.startsWith('access_') ||
    username.startsWith('user_');
}

export function validateUsername(value: unknown): UsernameValidation {
  const username = normalizeUsername(value);
  if (!username) return { ok: false, reason: 'invalid' };
  if (isReservedUsername(username)) return { ok: false, reason: 'reserved' };
  return { ok: true, username };
}
