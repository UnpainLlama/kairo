import { describe, expect, it } from 'vitest';
import { isAccessLoginRedirect, resolveAccountResponse } from './accountState';

describe('account response classification', () => {
  it('keeps first-admin setup distinct from guest mode', () => {
    expect(resolveAccountResponse(401, 'ADMIN_SETUP_REQUIRED', false)).toBe('setup-required');
    expect(resolveAccountResponse(401, 'AUTH_REQUIRED', false)).toBe('guest');
  });

  it('requires Access reauthentication for missing or expired Access assertions', () => {
    expect(resolveAccountResponse(401, 'ACCESS_REQUIRED', false)).toBe('reauth-required');
    expect(resolveAccountResponse(401, 'ACCESS_REAUTH_REQUIRED', false)).toBe('reauth-required');
    expect(resolveAccountResponse(401, undefined, false)).toBe('reauth-required');
  });

  it('reports the full 15-account allocation separately from a rejected identity', () => {
    expect(resolveAccountResponse(403, 'ACCESS_ACCOUNT_LIMIT_REACHED', false)).toBe('limit-reached');
  });

  it('does not downgrade a rejected identity to guest mode', () => {
    expect(resolveAccountResponse(403, 'ACCESS_ACCOUNT_DISABLED', false)).toBe('denied');
  });

  it('requires a validated profile before reporting signed in', () => {
    expect(resolveAccountResponse(200, undefined, true)).toBe('signed-in');
    expect(resolveAccountResponse(200, undefined, false)).toBe('unavailable');
    expect(resolveAccountResponse(503, 'ACCOUNT_SESSION_UNAVAILABLE', false)).toBe('unavailable');
  });
});


describe('Access login redirect detection', () => {
  it('recognises a redirected Access HTML login response', () => {
    expect(isAccessLoginRedirect({
      status: 200,
      redirected: true,
      url: 'https://kairo.example/cdn-cgi/access/login',
      contentType: 'text/html; charset=utf-8',
    })).toBe(true);
  });

  it('does not mistake a normal JSON API response for an Access login', () => {
    expect(isAccessLoginRedirect({
      status: 200,
      redirected: false,
      url: 'https://kairo.example/api/v1/me',
      contentType: 'application/json',
    })).toBe(false);
  });
});
