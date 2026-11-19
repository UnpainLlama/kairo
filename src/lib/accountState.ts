export type AccountResolution = 'guest' | 'signed-in' | 'denied' | 'limit-reached' | 'setup-required' | 'reauth-required' | 'unavailable';

/** Classify the /me response without conflating an unfinished bootstrap or expired Access token with guest mode. */
export function resolveAccountResponse(
  status: number,
  errorCode: unknown,
  hasValidUser: boolean,
): AccountResolution {
  if (status === 401) {
    if (errorCode === 'ADMIN_SETUP_REQUIRED') return 'setup-required';
    if (errorCode === 'AUTH_REQUIRED') return 'guest';
    if (errorCode === 'ACCESS_REQUIRED' || typeof errorCode !== 'string') return 'reauth-required';
  }
  if (status === 403 && errorCode === 'ACCESS_ACCOUNT_LIMIT_REACHED') return 'limit-reached';
  if (status === 403 && typeof errorCode === 'string' && errorCode.startsWith('ACCESS_')) return 'denied';
  if (status >= 200 && status < 300 && hasValidUser) return 'signed-in';
  return 'unavailable';
}
