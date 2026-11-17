import { describe, expect, it } from 'vitest';
import { clearSessionCookie, createOpaqueToken, createSession, hashToken, readSessionCookie, sessionCookie } from './session';

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
});
