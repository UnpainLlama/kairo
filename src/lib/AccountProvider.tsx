import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushPendingMediaPlayback } from './mediaPlayback';
import { resolveAccountResponse } from './accountState';

export type AccountStatus = 'loading' | 'guest' | 'signed-in' | 'denied' | 'limit-reached' | 'setup-required' | 'reauth-required' | 'unavailable';
export type KairoAccountState = {
  status: AccountStatus;
  accountId: string | null;
  displayName: string | null;
  email: string | null;
  username: string | null;
  role: 'user' | 'admin' | null;
  retry: () => void;
};

const AccountContext = createContext<KairoAccountState | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<AccountStatus>('loading');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<'user' | 'admin' | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => setAttempt((value) => value + 1);
    // Keep the last verified identity while revalidating. In particular, a
    // window-focus event must not briefly turn a signed-in user into a guest
    // or unmount account-scoped media players.
    if (!accountId) setStatus('loading');

    const clearIdentity = () => {
      setAccountId(null);
      setDisplayName(null);
      setEmail(null);
      setUsername(null);
      setRole(null);
    };

    const load = async () => {
      try {
        const response = await fetch('/api/v1/me', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        const errorCode = payload?.error?.code;
        const user = payload?.data?.user;
        const resolution = resolveAccountResponse(
          response.status,
          errorCode,
          payload?.success === true && typeof user?.id === 'string' && Boolean(user.id.trim()),
        );
        if (resolution === 'unavailable') throw new Error('Account lookup failed.');
        if (resolution !== 'signed-in') {
          if (active) {
            clearIdentity();
            setStatus(resolution);
          }
          return;
        }
        if (active) {
          setAccountId(user.id);
          setDisplayName(typeof user.displayName === 'string' ? user.displayName : null);
          setEmail(typeof user.accessEmail === 'string' ? user.accessEmail : typeof user.email === 'string' ? user.email : null);
          setUsername(typeof user.username === 'string' ? user.username : null);
          setRole(user.role === 'admin' ? 'admin' : 'user');
          setStatus('signed-in');
        }
      } catch {
        // A transient network failure must not discard a previously verified identity.
        if (active) setStatus(accountId ? 'signed-in' : 'unavailable');
      }
    };

    void load();
    window.addEventListener('kairo:auth-change', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('kairo:auth-change', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [attempt]);

  useEffect(() => {
    if (status !== 'signed-in' || !accountId) return;
    const flush = () => { void flushPendingMediaPlayback(accountId); };
    flush();
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    const interval = window.setInterval(flush, 60_000);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
      window.clearInterval(interval);
    };
  }, [accountId, status]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ status, accountId, displayName, email, username, role, retry }), [status, accountId, displayName, email, username, role, retry]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useKairoAccount(): KairoAccountState {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useKairoAccount must be used inside AccountProvider.');
  return value;
}
