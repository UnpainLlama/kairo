import { describe, expect, it } from 'vitest';
import { resolveAccountResponse } from './accountState';

describe('account response classification', () => {
  it('keeps first-admin setup distinct from guest mode', () => {
    expect(resolveAccountResponse(401, 'ADMIN_SETUP_REQUIRED', false)).toBe('setup-required');
    expect(resolveAccountResponse(401, 'AUTH_REQUIRED', false)).toBe('guest');
  });

  it('requires Access reauthentication for missing or expired Access assertions', () => {
    expect(resolveAccountResponse(401, 'ACCESS_REQUIRED', false)).toBe('reauth-required');
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
