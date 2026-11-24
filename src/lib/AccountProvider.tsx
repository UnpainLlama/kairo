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

type AccountContextValue = AccountState & {
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(signal?: AbortSignal): Promise<AccountUser | null>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>({
    status: 'loading',
    user: null,
    error: null,
  });

  const refresh = useCallback(async (signal?: AbortSignal): Promise<AccountUser | null> => {
    try {
      const result = await authRequest<{ user: AccountUser }>('/me', { method: 'GET', signal });
      if (!result.data.user || typeof result.data.user.id !== 'string') {
        throw new AuthApiError(502, 'INVALID_PROFILE', 'The server returned an invalid account profile.');
      }
      setState({ status: 'signed-in', user: result.data.user, error: null });
      return result.data.user;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof AuthApiError && error.status === 401 && error.code === 'AUTH_REQUIRED') {
        setState({ status: 'signed-out', user: null, error: null });
        return null;
      }
      const message = error instanceof Error ? error.message : 'The account could not be loaded.';
      setState({ status: 'error', user: null, error: message });
      throw error;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (state.status !== 'signed-in' || !state.user) return;
    const accountId = state.user.id;
    const flush = () => { void flushPendingMediaPlayback(accountId); };
    flush();
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
    };
  }, [state.status, state.user?.id]);

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
