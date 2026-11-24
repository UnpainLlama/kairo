const ALGORITHM = 'PBKDF2';
const HASH_NAME = 'SHA-256';
const FORMAT = 'pbkdf2-sha256';
export const PASSWORD_HASH_ITERATIONS = 100_000;
export const PASSWORD_HASH_VERSION = 2;
const MAX_PASSWORD_BYTES = 1024;

type HashProfile = Readonly<{
  iterations: number;
  saltBytes: number;
  hashBytes: number;
}>;

// Version 1 is the format used by the retired password helper. Keep it readable so
// any existing compatible credential can be upgraded after a successful login.
// Version 2 is the current format. Its cost is deliberately unchanged pending a
// real Workerd/staging measurement of the available CPU budget.
const HASH_PROFILE_ALLOWLIST: Readonly<Record<number, HashProfile>> = {
  1: { iterations: 100_000, saltBytes: 16, hashBytes: 32 },
  2: { iterations: PASSWORD_HASH_ITERATIONS, saltBytes: 16, hashBytes: 32 },
};

type ParsedHash = {
  version: number;
  iterations: number;
  salt: Uint8Array;
  derived: Uint8Array;
};

export function isNewPasswordValid(value: unknown): value is string {
  return typeof value === 'string' && Array.from(value).length >= 15 &&
    new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES;
}

export function isPasswordDifferentFromUsername(password: string, username: string): boolean {
  return password.toLocaleLowerCase('en-US') !== username.toLocaleLowerCase('en-US');
}

export async function hashPassword(password: string): Promise<string> {
  const passwordBytes = validatePassword(password);
  const profile = HASH_PROFILE_ALLOWLIST[PASSWORD_HASH_VERSION];
  const salt = crypto.getRandomValues(new Uint8Array(profile.saltBytes));
  const derived = await derive(passwordBytes, salt, profile.iterations, profile.hashBytes);
  return [
    FORMAT,
    `v=${PASSWORD_HASH_VERSION}`,
    `i=${profile.iterations}`,
    encodeBase64Url(salt),
    encodeBase64Url(derived),
  ].join('$');
}

/** Returns false for malformed hashes and never accepts attacker-selected PBKDF2 costs. */
export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  let passwordBytes: Uint8Array;
  try { passwordBytes = validatePassword(password); } catch { return false; }

  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;
  const profile = HASH_PROFILE_ALLOWLIST[parsed.version];
  const actual = await derive(passwordBytes, parsed.salt, parsed.iterations, profile.hashBytes);
  return constantTimeEqual(actual, parsed.derived);
}

/** Call only after verifyPassword succeeds; true means this accepted hash should be upgraded. */
export function needsRehash(encodedHash: string): boolean {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;
  return parsed.version !== PASSWORD_HASH_VERSION ||
    parsed.iterations !== PASSWORD_HASH_ITERATIONS;
}

function parsePasswordHash(encodedHash: string): ParsedHash | null {
  if (typeof encodedHash !== 'string' || encodedHash.length > 256) return null;
  const parts = encodedHash.split('$');
  if (parts.length !== 5 || parts[0] !== FORMAT) return null;

  const versionMatch = /^v=(\d{1,3})$/.exec(parts[1]);
  const iterationsMatch = /^i=(\d{1,9})$/.exec(parts[2]);
  if (!versionMatch || !iterationsMatch) return null;
  const version = Number(versionMatch[1]);
  const iterations = Number(iterationsMatch[1]);
  const profile = HASH_PROFILE_ALLOWLIST[version];
  if (!profile || iterations !== profile.iterations) return null;

  const salt = decodeBase64Url(parts[3]);
  const derived = decodeBase64Url(parts[4]);
  if (!salt || salt.length !== profile.saltBytes ||
      !derived || derived.length !== profile.hashBytes) return null;
  return { version, iterations, salt, derived };
}

function validatePassword(password: string): Uint8Array {
  if (typeof password !== 'string') throw new TypeError('Password must be a string.');
  const bytes = new TextEncoder().encode(password);
  if (bytes.length === 0 || bytes.length > MAX_PASSWORD_BYTES) {
    throw new RangeError(`Password must be between 1 and ${MAX_PASSWORD_BYTES} UTF-8 bytes.`);
  }
  return bytes;
}

async function derive(password: Uint8Array, salt: Uint8Array, iterations: number, hashBytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', password, ALGORITHM, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, hash: HASH_NAME, salt, iterations },
    key,
    hashBytes * 8,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replaceAll('+', '-').replaceAll('/', '_');
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return encodeBase64Url(bytes) === value ? bytes : null;
  } catch { return null; }
}
