import { afterEach, describe, expect, it } from 'vitest';
import { clearSessionCookie, createOpaqueToken, findSessionUser, hashToken, readSessionCookie, sessionCookie } from './session';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from './testUtils';

let db: any;
afterEach(() => { db?.close(); db = undefined; });

describe('Kairo session primitives', () => {
  it('creates 256-bit opaque tokens and stores only a SHA-256 digest', async () => {
    const token = createOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createOpaqueToken()).not.toBe(token);
    const hash = await hashToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(await hashToken(token)).toBe(hash);
  });

  it('reads only a well-formed Kairo session cookie', () => {
    const token = createOpaqueToken();
    expect(readSessionCookie('theme=dark; kairo_session=' + token + '; other=value')).toBe(token);
    expect(readSessionCookie('theme=dark')).toBeNull();
    expect(readSessionCookie('kairo_session=short')).toBeNull();
    expect(readSessionCookie('kairo_session=bad.value')).toBeNull();
  });

  it('sets HttpOnly, Secure, SameSite=Lax and Path cookie flags', () => {
    const cookie = sessionCookie(createOpaqueToken());
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(clearSessionCookie()).toContain('Max-Age=0');
    expect(clearSessionCookie(false)).not.toContain('Secure');
    expect(sessionCookie(createOpaqueToken(), true, 8 * 60 * 60)).toContain('Max-Age=28800');
  });

  it('resolves stable profile IDs and forced-password flags from active credential-backed sessions', async () => {
    db = createTestDatabase();
    insertTestProfile(db, { id: 'user-one', username: 'user.one', displayName: 'User One' });
    await insertTestCredential(db, 'user-one', 'correct horse battery staple', true);
    const session = await createTestSession(db, 'user-one');
    const user = await findSessionUser(sqliteD1(db), session.cookie);
    expect(user).toMatchObject({ id: 'user-one', username: 'user.one', role: 'user', mustChangePassword: true });
    expect(user).not.toHaveProperty('accessEmail');
    expect(user).not.toHaveProperty('accessSubject');

    db.prepare("UPDATE user_profiles SET account_status='suspended' WHERE id='user-one'").run();
    await expect(findSessionUser(sqliteD1(db), session.cookie)).resolves.toBeNull();
  });

  it('does not resolve a session after its credential row is removed', async () => {
    db = createTestDatabase();
    insertTestProfile(db, { id: 'user-one', username: 'user.one' });
    await insertTestCredential(db, 'user-one', 'correct horse battery staple');
    const session = await createTestSession(db, 'user-one');
    db.prepare("DELETE FROM user_credentials WHERE user_id='user-one'").run();
    await expect(findSessionUser(sqliteD1(db), session.cookie)).resolves.toBeNull();
  });
});
