import { useEffect, useState } from 'react';

type AccountScopeState = {
  accountId: string | null;
  resolved: boolean;
  error: boolean;
  retry: () => void;
};

/** Resolves the current Kairo session before any account-scoped browser data is read or written. */
export function useAccountScope(): AccountScopeState {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => setAttempt((current) => current + 1);
    setResolved(false);
    setError(false);

    const load = async () => {
      try {
        const response = await fetch('/api/v1/me', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (response.status === 401) {
          if (active) {
            setAccountId(null);
            setResolved(true);
          }
          return;
        }
        if (!response.ok) throw new Error('Could not resolve the current account.');
        const payload = await response.json();
        const id = payload?.data?.user?.id;
        if (!payload?.success || typeof id !== 'string' || !id.trim()) {
          throw new Error('The account response was invalid.');
        }
        if (active) {
          setAccountId(id);
          setResolved(true);
        }
      } catch {
        if (active) {
          setError(true);
          setResolved(false);
        }
      }
    };

    void load();
    window.addEventListener('kairo:auth-change', refresh);
    return () => {
      active = false;
      window.removeEventListener('kairo:auth-change', refresh);
    };
  }, [attempt]);

  return { accountId, resolved, error, retry: () => setAttempt((current) => current + 1) };
}
