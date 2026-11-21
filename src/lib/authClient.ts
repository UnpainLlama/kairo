import { clearAccountScopedBrowserData } from './accountScopedStorage';

export async function logoutKairoSession(): Promise<void> {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    error?: { message?: string };
  } | null;
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error?.message ?? 'Could not sign out. Please try again.');
  }
}

/** Revoke the server session, clear only that account's browser cache, then leave Access. */
export async function signOutKairoAccount(
  userId: string | null | undefined,
  redirect: (url: string) => void,
): Promise<void> {
  await logoutKairoSession();
  clearAccountScopedBrowserData(userId);
  redirect('/cdn-cgi/access/logout');
}
