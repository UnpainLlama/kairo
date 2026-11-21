import { afterEach, describe, expect, it, vi } from 'vitest';
import { logoutKairoSession } from './authClient';

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
});
