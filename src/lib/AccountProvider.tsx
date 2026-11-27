import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type AccountStatus = 'loading' | 'guest' | 'signed-in' | 'unavailable';
export type KairoAccountState = {
  status: AccountStatus;
  accountId: string | null;
  displayName: string | null;
  email: string | null;
  retry: () => void;
};

const AccountContext = createContext<KairoAccountState | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<AccountStatus>('loading');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const hasResolvedSession = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = () => setAttempt((value) => value + 1);
    const authChanged = () => {
      // Explicit sign-in/sign-out changes should invalidate the previous identity.
      hasResolvedSession.current = false;
      setStatus('loading');
      setAccountId(null);
      setDisplayName(null);
      setEmail(null);
      refresh();
    };

    const load = async () => {
      try {
        const response = await fetch('/api/v1/me', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (response.status === 401) {
          if (active) {
            setAccountId(null);
            setDisplayName(null);
            setEmail(null);
            setStatus('guest');
            hasResolvedSession.current = true;
          }
          return;
        }
        if (!response.ok) throw new Error('Account lookup failed.');
        const payload = await response.json();
        const user = payload?.data?.user;
        if (!payload?.success || typeof user?.id !== 'string' || !user.id.trim()) {
          throw new Error('Account response was invalid.');
        }
        if (active) {
          setAccountId(user.id);
          setDisplayName(typeof user.displayName === 'string' ? user.displayName : null);
          setEmail(typeof user.email === 'string' ? user.email : null);
          setStatus('signed-in');
          hasResolvedSession.current = true;
        }
      } catch {
        // A transient focus revalidation failure must not unmount a working player.
        // Only an initial unresolved lookup becomes unavailable.
        if (active && !hasResolvedSession.current) setStatus('unavailable');
      }
    };

    void load();
    window.addEventListener('kairo:auth-change', authChanged);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('kairo:auth-change', authChanged);
      window.removeEventListener('focus', refresh);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ status, accountId, displayName, email, retry }), [status, accountId, displayName, email, retry]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useKairoAccount(): KairoAccountState {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useKairoAccount must be used inside AccountProvider.');
  return value;
}
