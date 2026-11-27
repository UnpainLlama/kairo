import { useKairoAccount } from '../lib/AccountProvider';

/** Shared session state for every account-scoped local store and media feature. */
export function useAccountScope() {
  const account = useKairoAccount();
  return {
    accountId: account.accountId,
    resolved: account.status === 'guest' || account.status === 'signed-in',
    error: account.status === 'unavailable',
    loading: account.status === 'loading',
    retry: account.retry,
  };
}
