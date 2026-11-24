import { afterEach, describe, expect, it, vi } from 'vitest';
import { authRequest } from './authClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth API response handling', () => {
  it('detects redirects to the Cloudflare Access login page', async () => {
    const response = new Response('<html>Sign in</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    Object.defineProperty(response, 'redirected', { value: true });
    Object.defineProperty(response, 'url', {
      value: 'https://kairo.example/cdn-cgi/access/login',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(authRequest('/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'temporary', newPassword: 'five word new pass phrase' }),
    })).rejects.toMatchObject({
      code: 'AUTH_REDIRECT',
      status: 200,
    });
  });

  it('detects a non-JSON login or error page returned by a successful HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      '<html>Login page</html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )));

    await expect(authRequest('/me')).rejects.toMatchObject({
      code: 'NON_JSON_RESPONSE',
      status: 200,
    });
  });

  it('reports an outdated or missing API route clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      'Not found',
      { status: 404, headers: { 'Content-Type': 'text/plain' } },
    )));

    await expect(authRequest('/me/password', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      code: 'API_ROUTE_NOT_FOUND',
      status: 404,
    });
  });

  it('preserves structured Worker errors for the password form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        success: false,
        error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'The current password is incorrect.' },
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(authRequest('/me/password', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      code: 'CURRENT_PASSWORD_INCORRECT',
      message: 'The current password is incorrect.',
      status: 403,
    });
  });

  it('accepts a valid Kairo JSON envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        success: true,
        data: { passwordChanged: true },
        meta: { requestId: 'request-123' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(authRequest<{ passwordChanged: boolean }>('/me/password', {
      method: 'POST',
      body: '{}',
    })).resolves.toEqual({
      data: { passwordChanged: true },
      meta: { requestId: 'request-123' },
    });
  });
});
