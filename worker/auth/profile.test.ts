import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerProfileRoutes } from './profile';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from './testUtils';

let db: any;
afterEach(() => { db?.close(); db = undefined; });

async function setup(role: 'user' | 'admin' = 'user') {
  db = createTestDatabase();
  insertTestProfile(db, { id: 'account-1', username: 'profile.user', role });
  await insertTestCredential(db, 'account-1', 'a sufficiently long profile password');
  const session = await createTestSession(db, 'account-1');
  const app = new Hono();
  registerProfileRoutes(app);
  return { app, session, env: { DB: sqliteD1(db) } };
}

describe('account profile privacy routes', () => {
  it('returns and updates only the signed-in profile', async () => {
    const { app, session, env } = await setup();
    const headers = { Cookie: session.cookie, Accept: 'application/json' };
    const read = await app.request('https://kairo.test/api/v1/me/profile', { headers }, env);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ data: { profile: { id: 'account-1', username: 'profile.user', visibility: 'private' } } });

    const update = await app.request('https://kairo.test/api/v1/me/profile', {
      method: 'PUT',
      headers: { ...headers, Origin: 'https://kairo.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Profile User', bio: 'A short bio.', visibility: 'public' }),
    }, env);
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ data: { updated: true, displayName: 'Profile User', bio: 'A short bio.', visibility: 'public' } });
  });

  it('only exposes profiles that opted into public visibility and omits private account fields', async () => {
    const { app, session, env } = await setup();
    const privateRead = await app.request('https://kairo.test/api/v1/profiles/profile.user', {
      headers: { Cookie: session.cookie, Accept: 'application/json' },
    }, env);
    expect(privateRead.status).toBe(404);

    db.prepare("UPDATE user_profiles SET profile_visibility = 'public', bio = 'Public bio' WHERE id = 'account-1'").run();
    const publicRead = await app.request('https://kairo.test/api/v1/profiles/profile.user', {
      headers: { Cookie: session.cookie, Accept: 'application/json' },
    }, env);
    const body = await publicRead.json();
    expect(publicRead.status).toBe(200);
    expect(body).toMatchObject({ data: { profile: { username: 'profile.user', bio: 'Public bio' } } });
    expect(JSON.stringify(body)).not.toContain('email');
    expect(JSON.stringify(body)).not.toContain('account-1');
  });

  it('rejects invalid profile data and cross-origin writes', async () => {
    const { app, session, env } = await setup();
    const headers = { Cookie: session.cookie, 'Content-Type': 'application/json' };
    const invalid = await app.request('https://kairo.test/api/v1/me/profile', {
      method: 'PUT', headers, body: JSON.stringify({ displayName: 'x', bio: 'ok', visibility: 'public' }),
    }, env);
    const cross = await app.request('https://kairo.test/api/v1/me/profile', {
      method: 'PUT', headers: { ...headers, Origin: 'https://attacker.test' },
      body: JSON.stringify({ displayName: 'Profile User', bio: '', visibility: 'private' }),
    }, env);
    expect(invalid.status).toBe(400);
    expect(cross.status).toBe(403);
  });

  it('exports private account data without returning password hashes or session tokens', async () => {
    const { app, session, env } = await setup();
    const response = await app.request('https://kairo.test/api/v1/me/export', {
      headers: { Cookie: session.cookie, Accept: 'application/json' },
    }, env);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('profile.user');
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('kairo_session');
  });

  it('prevents administrator self-deletion', async () => {
    const { app, session, env } = await setup('admin');
    db.prepare("INSERT INTO user_anime_library_refs (user_id, provider_id, external_id, slug, added_at, updated_at) VALUES ('account-1', 'legacy', '1535', 'dorohedoro-a1535', 1, 1)").run();
    const response = await app.request('https://kairo.test/api/v1/me/account', {
      method: 'DELETE',
      headers: { Cookie: session.cookie, Origin: 'https://kairo.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'a sufficiently long profile password', confirmUsername: 'profile.user' }),
    }, env);
    expect(response.status).toBe(403);
  });

  it('requires the correct password and username to delete an ordinary account', async () => {
    const { app, session, env } = await setup();
    db.prepare("INSERT INTO user_anime_library_refs (user_id, provider_id, external_id, slug, added_at, updated_at) VALUES ('account-1', 'legacy', '1535', 'dorohedoro-a1535', 1, 1)").run();
    const response = await app.request('https://kairo.test/api/v1/me/account', {
      method: 'DELETE',
      headers: { Cookie: session.cookie, Origin: 'https://kairo.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'a sufficiently long profile password', confirmUsername: 'profile.user' }),
    }, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { deleted: true, accountDataDeleted: true, tombstoneRetained: true } });
    expect(db.prepare("SELECT account_status AS status, username, display_name AS displayName FROM user_profiles WHERE id = 'account-1'").get()).toMatchObject({
      status: 'deleted', username: null, displayName: 'Former account',
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM user_credentials WHERE user_id = 'account-1'").get().count).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS count FROM user_anime_library_refs WHERE user_id = 'account-1'").get().count).toBe(0);
  });
});
