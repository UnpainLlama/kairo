import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthApiError, authRequest } from './authClient';
import { flushPendingMediaPlayback } from './mediaPlayback';

export type AccountUser = {
  id: string;
  displayName: string;
  email: string | null;
  username: string;
  emailVerifiedAt: string | null;
  role: 'user' | 'admin';
  mustChangePassword: boolean;
};

export type AccountState = {
  status: 'loading' | 'signed-in' | 'signed-out' | 'error';
  user: AccountUser | null;
  error: string | null;
};

type RefreshOptions = {
  /** Keep the current signed-in view when a post-mutation refresh fails transiently. */
  preserveSignedInOnError?: boolean;
};

type AccountContextValue = AccountState & {
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(signal?: AbortSignal, options?: RefreshOptions): Promise<AccountUser | null>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>({
    status: 'loading',
    user: null,
    error: null,
  });

  const refresh = useCallback(async (signal?: AbortSignal, options: RefreshOptions = {}): Promise<AccountUser | null> => {
    try {
      const result = await authRequest<{ user: AccountUser }>('/me', { method: 'GET', signal });
      if (!result.data.user || typeof result.data.user.id !== 'string' ||
          typeof result.data.user.username !== 'string' ||
          typeof result.data.user.mustChangePassword !== 'boolean') {
        throw new AuthApiError(502, 'INVALID_PROFILE', 'The server returned an incomplete account profile. Reload Kairo and try again.');
      }
      setState({ status: 'signed-in', user: result.data.user, error: null });
      return result.data.user;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof AuthApiError && error.status === 401 && error.code === 'AUTH_REQUIRED') {
        setState({ status: 'signed-out', user: null, error: null });
        return null;
      }
      if (!options.preserveSignedInOnError) {
        const message = error instanceof Error ? error.message : 'The account could not be loaded.';
        setState({ status: 'error', user: null, error: message });
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (state.status !== 'signed-in' || !state.user || state.user.mustChangePassword) return;
    const accountId = state.user.id;
    const flush = () => { void flushPendingMediaPlayback(accountId); };
    flush();
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
    };
  }, [state.status, state.user?.id, state.user?.mustChangePassword]);

  const login = useCallback(async (username: string, password: string) => {
    await authRequest<{ signedIn: boolean; mustChangePassword: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const user = await refresh();
    if (!user) throw new AuthApiError(401, 'AUTH_REQUIRED', 'Sign-in succeeded but the account session could not be loaded.');
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await authRequest<{ signedOut: boolean }>('/auth/logout', { method: 'POST' });
      setState({ status: 'signed-out', user: null, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-out failed.';
      setState({ status: 'error', user: null, error: message });
      throw error;
    }
  }, []);

  const value = useMemo<AccountContextValue>(() => ({ ...state, login, logout, refresh }), [state, login, logout, refresh]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccount must be used inside AccountProvider.');
  return context;
}


/**
 * Compatibility view for the original Kairo page modules. Authentication itself
 * remains the current username/password AccountProvider; this adapter only
 * exposes its verified profile in the shape those UI pages expect.
 */
export type KairoAccountState = {
  status: 'loading' | 'guest' | 'signed-in' | 'denied' | 'limit-reached' | 'setup-required' | 'reauth-required' | 'unavailable';
  accountId: string | null;
  displayName: string | null;
  email: string | null;
  username: string | null;
  role: 'user' | 'admin' | null;
  retry: () => void;
};

export function useKairoAccount(): KairoAccountState {
  const account = useAccount();
  const retry = () => { void account.refresh().catch(() => undefined); };
  const status: KairoAccountState['status'] =
    account.status === 'loading' ? 'loading' :
    account.status === 'signed-in' ? 'signed-in' :
    account.status === 'signed-out' ? 'guest' : 'unavailable';

  return {
    status,
    accountId: account.user?.id ?? null,
    displayName: account.user?.displayName ?? null,
    email: account.user?.email ?? null,
    username: account.user?.username ?? null,
    role: account.user?.role ?? null,
    retry,
  };
}
