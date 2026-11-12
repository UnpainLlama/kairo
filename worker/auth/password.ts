const ALGORITHM = 'PBKDF2';
const HASH_NAME = 'SHA-256';
const FORMAT = 'pbkdf2-sha256';
const VERSION = 1;
// workerd currently rejects any single WebCrypto PBKDF2 operation above 100,000 iterations.
// This is a runtime compatibility ceiling, not the ideal password-hashing cost; see the
// account architecture docs for the security trade-off and follow-up options.
export const PASSWORD_HASH_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const MAX_PASSWORD_BYTES = 1024;

export async function hashPassword(password: string): Promise<string> {
  const passwordBytes = validatePassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(passwordBytes, salt, PASSWORD_HASH_ITERATIONS);
  return [FORMAT, `v=${VERSION}`, `i=${PASSWORD_HASH_ITERATIONS}`, encodeBase64Url(salt), encodeBase64Url(derived)].join('$');
}

/** Returns false for malformed or unsupported hashes; never trusts arbitrary cost values from D1. */
export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  let passwordBytes: Uint8Array;
  try { passwordBytes = validatePassword(password); } catch { return false; }

  const parts = encodedHash.split('$');
  if (parts.length !== 5 || parts[0] !== FORMAT || parts[1] !== `v=${VERSION}`) return false;
  if (parts[2] !== `i=${PASSWORD_HASH_ITERATIONS}`) return false;

  const salt = decodeBase64Url(parts[3]);
  const expected = decodeBase64Url(parts[4]);
  if (!salt || salt.length !== SALT_BYTES || !expected || expected.length !== HASH_BYTES) return false;

  const actual = await derive(passwordBytes, salt, PASSWORD_HASH_ITERATIONS);
  return constantTimeEqual(actual, expected);
}

function validatePassword(password: string): Uint8Array {
  if (typeof password !== 'string') throw new TypeError('Password must be a string.');
  const bytes = new TextEncoder().encode(password);
  if (bytes.length === 0 || bytes.length > MAX_PASSWORD_BYTES) throw new RangeError(`Password must be between 1 and ${MAX_PASSWORD_BYTES} UTF-8 bytes.`);
  return bytes;
}

async function derive(password: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', password, ALGORITHM, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: ALGORITHM, hash: HASH_NAME, salt, iterations }, key, HASH_BYTES * 8);
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
