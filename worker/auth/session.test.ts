import { describe, expect, it } from 'vitest';
import { clearSessionCookie, createOpaqueToken, hashToken, readSessionCookie, sessionCookie } from './session';

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
