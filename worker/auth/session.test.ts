import { describe, expect, it } from 'vitest';
import { clearSessionCookie, createOpaqueToken, createSession, findSessionUser, hashToken, readSessionCookie, sessionCookie } from './session';

describe('session primitives', () => {
  it('creates 256-bit URL-safe opaque tokens', () => {
    const token = createOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createOpaqueToken()).not.toBe(token);
  });

  it('hashes tokens deterministically', async () => {
    const hash = await hashToken('example-session-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('example-session-token');
    expect(await hashToken('example-session-token')).toBe(hash);
  });

  it('reads only a well-formed Kairo session cookie', () => {
    const token = createOpaqueToken();
    expect(readSessionCookie(`theme=dark; kairo_session=${token}; other=value`)).toBe(token);
    expect(readSessionCookie('theme=dark')).toBeNull();
    expect(readSessionCookie('kairo_session=short')).toBeNull();
    expect(readSessionCookie('kairo_session=bad.value')).toBeNull();
  });

  it('supports shorter administrator sessions without changing standard session defaults', async () => {
    const now = 1_800_000_000_000;
    const db = {
      prepare: () => ({
        bind: () => ({ run: async () => ({ success: true, meta: { changes: 1 } }) }),
      }),
    } as unknown as D1Database;
    const adminSession = await createSession(db, 'admin-user', { ttlSeconds: 8 * 60 * 60 }, now);
    expect(adminSession.expiresAt).toBe(now + 8 * 60 * 60 * 1000);
    expect(adminSession.ttlSeconds).toBe(8 * 60 * 60);
    expect(sessionCookie(adminSession.token, true, adminSession.ttlSeconds)).toContain('Max-Age=28800');
  });

  it('sets secure HTTP-only same-site cookies and clears them', () => {
    const token = createOpaqueToken();
    const cookie = sessionCookie(token);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(clearSessionCookie()).toContain('Max-Age=0');
    expect(clearSessionCookie(false)).not.toContain('Secure');
  });
  it('binds sessions to the current verified Cloudflare Access email and blocks admin sessions while locked', async () => {
    const token = createOpaqueToken();
    const queryLog: Array<{ sql: string; values: unknown[] }> = [];
    let role: 'user' | 'admin' = 'user';
    let adminLocked = false;
    const db = {
      prepare(sql: string) {
        return {
          bind: (...values: unknown[]) => ({
            first: async () => {
              queryLog.push({ sql, values });
              const requestedEmail = values[2] as string | null;
              if (requestedEmail && requestedEmail.toLowerCase() !== 'invited@gmail.com') return null;
              if (role === 'admin' && adminLocked && sql.includes('admin_login_security')) return null;
              return {
                userId: 'standard-user',
                displayName: 'Invited User',
                email: null,
                username: 'InvitedUser',
                accessEmail: 'invited@gmail.com',
                emailVerifiedAt: null,
                role,
              };
            },
          }),
        };
      },
    } as unknown as D1Database;

    await expect(findSessionUser(db, `kairo_session=${token}`, 1234, 'another@gmail.com')).resolves.toBeNull();
    const user = await findSessionUser(db, `kairo_session=${token}`, 1234, 'INVITED@gmail.com');
    expect(user).toMatchObject({ id: 'standard-user', accessEmail: 'invited@gmail.com', role: 'user' });
    expect(queryLog.every(entry => entry.sql.includes('lower(s.access_email)') && entry.sql.includes('lower(p.access_email)'))).toBe(true);
    expect(queryLog[1].values.slice(2)).toEqual(['INVITED@gmail.com', 'INVITED@gmail.com', 'INVITED@gmail.com']);
    expect(queryLog[1].sql).toContain('NOT EXISTS (');

    role = 'admin';
    adminLocked = true;
    await expect(findSessionUser(db, `kairo_session=${token}`, 1234, 'invited@gmail.com')).resolves.toBeNull();
  });

});
