import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerAuthRoutes } from './routes';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from './testUtils';

const PASSWORD = 'correct horse battery staple';
let db: any;
afterEach(() => { db?.close(); db = undefined; });

async function setup(mustChange = false) {
  db = createTestDatabase();
  insertTestProfile(db, { id: 'user-one', username: 'member.one' });
  await insertTestCredential(db, 'user-one', PASSWORD, mustChange);
  const app = new Hono();
  registerAuthRoutes(app);
  return { app, env: { DB: sqliteD1(db) } };
}

describe('username/password authentication routes', () => {
  it('returns the same 401 code and message for unknown usernames and incorrect passwords', async () => {
    const { app, env } = await setup();
    const request = (username: string, password: string) => app.request('https://kairo.test/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }, env);

    const unknown = await request('not.registered', PASSWORD);
    const wrong = await request('member.one', 'an incorrect passphrase');

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    const unknownBody = await unknown.json() as any;
    const wrongBody = await wrong.json() as any;
    expect(unknownBody.error).toEqual(wrongBody.error);
    expect(unknownBody.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Username or password is incorrect.' });
  });

  it('counts malformed usernames against the source-IP failure budget', async () => {
    const { app, env } = await setup();
    const response = await app.request('https://kairo.test/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.20' },
      body: JSON.stringify({ username: 'not a username', password: PASSWORD }),
    }, env);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS', message: 'Username or password is incorrect.' },
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM auth_rate_limits').get()).toEqual({ count: 1 });
  });

  it('does not let a successful login clear the shared source-IP failure bucket', async () => {
    const { app, env } = await setup();
    const request = (password: string) => app.request('https://kairo.test/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.21' },
      body: JSON.stringify({ username: 'member.one', password }),
    }, env);

    expect((await request('incorrect passphrase')).status).toBe(401);
    expect((await request(PASSWORD)).status).toBe(200);
    // The per-username bucket is cleared; the IP bucket persists for the rolling window.
    expect(db.prepare('SELECT COUNT(*) AS count FROM auth_rate_limits').get()).toEqual({ count: 1 });
  });

  it('normalizes usernames, creates a hashed server-side session, and exposes mustChangePassword', async () => {
    const { app, env } = await setup(true);
    const response = await app.request('https://kairo.test/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'MEMBER.ONE', password: PASSWORD }),
    }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { signedIn: true, mustChangePassword: true } });
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('kairo_session=');
    expect(cookie).toContain('HttpOnly');
    expect(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id='user-one'").get()).toEqual({ count: 1 });
    const stored = db.prepare("SELECT token_hash FROM sessions WHERE user_id='user-one'").get() as { token_hash: string };
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reveals suspension only after a correct password', async () => {
    const { app, env } = await setup();
    db.prepare("UPDATE user_profiles SET account_status='suspended' WHERE id='user-one'").run();
    const wrong = await app.request('https://kairo.test/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'member.one', password: 'incorrect password phrase' }),
    }, env);
    const correct = await app.request('https://kairo.test/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'member.one', password: PASSWORD }),
    }, env);
    expect(wrong.status).toBe(401);
    expect(correct.status).toBe(403);
    expect(await correct.json()).toMatchObject({ error: { code: 'ACCOUNT_SUSPENDED' } });
  });

  it('changes a password, clears forced-change state and revokes every other session', async () => {
    const { app, env } = await setup(true);
    const current = await createTestSession(db, 'user-one');
    await createTestSession(db, 'user-one');
    const response = await app.request('https://kairo.test/api/v1/me/password', {
      method: 'POST',
      headers: { Cookie: current.cookie, Origin: 'https://kairo.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'a new secure and longer phrase' }),
    }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { passwordChanged: true, sessionsRevoked: true, mustChangePassword: false },
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id='user-one'").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT must_change_password AS mustChange FROM user_credentials WHERE user_id='user-one'").get()).toEqual({ mustChange: 0 });
  });
});
