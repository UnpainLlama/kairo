#!/usr/bin/env node
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';

const HASH_VERSION = 2;
const HASH_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const MAX_PASSWORD_BYTES = 1024;

export function normalizeUsername(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{3,32}$/.test(value)) return null;
  const username = value.toLowerCase();
  if (['root', 'system', 'support', 'kairo'].includes(username) ||
      username.startsWith('access_') || username.startsWith('user_')) return null;
  return username;
}

export function isValidPassword(password, username) {
  return typeof password === 'string' &&
    Array.from(password).length >= 15 &&
    Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES &&
    password.toLowerCase() !== username.toLowerCase();
}

export function createPasswordHash(password, salt = randomBytes(SALT_BYTES)) {
  const derived = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_BYTES, 'sha256');
  return `pbkdf2-sha256$v=${HASH_VERSION}$i=${HASH_ITERATIONS}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function sqlString(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

export function buildAdminPasswordSql(userId, username, passwordHash) {
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 200) throw new Error('A valid admin profile ID is required.');
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) throw new Error('The username is invalid or reserved.');
  if (!/^pbkdf2-sha256\$v=2\$i=100000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(passwordHash)) {
    throw new Error('The password hash is not in the current Kairo format.');
  }
  const id = sqlString(userId);
  const name = sqlString(normalizedUsername);
  const hash = sqlString(passwordHash);
  return [
    'BEGIN;',
    `UPDATE user_profiles SET username=${name}, updated_at=CURRENT_TIMESTAMP WHERE id=${id} AND role='admin' AND account_status='active';`,
    `DELETE FROM sessions WHERE user_id=${id} AND EXISTS (SELECT 1 FROM user_profiles WHERE id=${id} AND role='admin' AND account_status='active' AND username=${name});`,
    'INSERT INTO user_credentials (user_id,password_hash,password_changed_at,must_change_password)',
    `SELECT id,${hash},CURRENT_TIMESTAMP,0 FROM user_profiles WHERE id=${id} AND role='admin' AND account_status='active' AND username=${name}`,
    'ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash, password_changed_at=CURRENT_TIMESTAMP, must_change_password=0;',
    'COMMIT;',
    `SELECT id,username,role,account_status FROM user_profiles WHERE id=${id};`,
    `SELECT user_id,must_change_password,password_changed_at FROM user_credentials WHERE user_id=${id};`,
    `SELECT COUNT(*) AS remaining_sessions FROM sessions WHERE user_id=${id};`,
  ].join('\n');
}

export async function readSecret(prompt, input = process.stdin, output = process.stderr) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('A real interactive terminal is required; passwords must not be supplied through command-line arguments or environment variables.');
  }
  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  const decoder = new StringDecoder('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      const text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      for (const character of text) {
        if (character === '\u0003') return finish(new Error('Password entry cancelled.'));
        if (character === '\r' || character === '\n') return finish(null);
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    input.on('data', onData);
    input.once('error', finish);
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

export async function run() {
  const userId = argument('--user-id');
  const username = normalizeUsername(argument('--username'));
  if (!userId || !username) {
    throw new Error('Usage: node scripts/set-admin-password.mjs --user-id <existing-admin-profile-id> --username <new-username>');
  }
  const password = await readSecret('New admin password (input hidden): ');
  const confirmation = await readSecret('Confirm admin password (input hidden): ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (!isValidPassword(password, username)) {
    throw new Error('Password must be at least 15 Unicode code points, at most 1024 UTF-8 bytes, and must not equal the username.');
  }
  const hash = createPasswordHash(password);
  const sql = buildAdminPasswordSql(userId, username, hash);
  process.stdout.write('\n-- Run this SQL against the intended D1 database. It contains a salted hash, not the password.\n');
  process.stdout.write(sql + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : 'Admin password generation failed.') + '\n');
    process.exitCode = 1;
  });
}
