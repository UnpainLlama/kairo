import { afterEach, describe, expect, it, vi } from 'vitest';
import { logoutKairoSession, signOutKairoAccount } from './authClient';

afterEach(() => vi.unstubAllGlobals());

describe('Kairo session logout', () => {
  it('revokes the same-origin server session before Access logout proceeds', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { signedOut: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(logoutKairoSession()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  });

  it('does not report logout success when the server did not revoke the session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: false,
      error: { message: 'Session revocation is temporarily unavailable.' },
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(logoutKairoSession()).rejects.toThrow('Session revocation is temporarily unavailable.');
  });
  it('revokes the Kairo session, clears only the active account cache, then redirects to Access', async () => {
    class Storage {
      values = new Map<string, string>();
      get length() { return this.values.size; }
      key(index: number) { return [...this.values.keys()][index] ?? null; }
      getItem(key: string) { return this.values.get(key) ?? null; }
      setItem(key: string, value: string) { this.values.set(key, value); }
      removeItem(key: string) { this.values.delete(key); }
    }
    const storage = new Storage();
    storage.setItem('kairo-watch-history:user-a', 'account cache');
    storage.setItem('kairo-watch-history:guest', 'guest cache');
    vi.stubGlobal('localStorage', storage);
    const events: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => {
      events.push('revoke');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));
    const redirect = vi.fn((url: string) => {
      events.push('redirect');
      expect(url).toBe('/cdn-cgi/access/logout');
      expect(storage.getItem('kairo-watch-history:user-a')).toBeNull();
      expect(storage.getItem('kairo-watch-history:guest')).toBe('guest cache');
    });

    await signOutKairoAccount('user-a', redirect);

    expect(events).toEqual(['revoke', 'redirect']);
  });

  it('keeps account-local data and does not redirect if server-side revocation fails', async () => {
    class Storage {
      values = new Map<string, string>();
      get length() { return this.values.size; }
      key(index: number) { return [...this.values.keys()][index] ?? null; }
      getItem(key: string) { return this.values.get(key) ?? null; }
      setItem(key: string, value: string) { this.values.set(key, value); }
      removeItem(key: string) { this.values.delete(key); }
    }
    const storage = new Storage();
    storage.setItem('kairo-watch-history:user-a', 'account cache');
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: false,
      error: { message: 'Session revocation is temporarily unavailable.' },
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })));
    const redirect = vi.fn();

    await expect(signOutKairoAccount('user-a', redirect)).rejects.toThrow('Session revocation is temporarily unavailable.');

    expect(storage.getItem('kairo-watch-history:user-a')).toBe('account cache');
    expect(redirect).not.toHaveBeenCalled();
  });

});
