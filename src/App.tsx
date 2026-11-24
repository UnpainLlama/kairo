import { useEffect, useState } from 'react';
import LoginPage from './components/LoginPage';
import AdminSetupPage from './components/AdminSetupPage';
import PasswordChangePage from './components/PasswordChangePage';
import { AccountProvider, useAccount, type AccountUser } from './lib/AccountProvider';
import { authRequest } from './lib/authClient';

function LoadingPage() {
  return (
    <main className="auth-shell" aria-live="polite">
      <section className="auth-panel">
        <img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" />
        <p className="eyebrow">Kairo</p>
        <h1>Checking your account…</h1>
        <p className="muted">Your session is being verified securely.</p>
      </section>
    </main>
  );
}

function AccountErrorPage({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="account-error-heading">
        <img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" />
        <p className="eyebrow">Kairo</p>
        <h1 id="account-error-heading">Account unavailable</h1>
        <p className="form-error" role="alert">{message}</p>
        <button className="primary-button" type="button" onClick={onRetry}>Try again</button>
      </section>
    </main>
  );
}

function SignedInPage({ user, onLogout }: { user: AccountUser; onLogout(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await onLogout();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-out failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel account-panel" aria-labelledby="signed-in-heading">
        <img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" />
        <p className="eyebrow">{user.role === 'admin' ? 'Kairo administrator' : 'Kairo account'}</p>
        <h1 id="signed-in-heading">You're signed in</h1>
        <p className="account-identity">{user.displayName} <span>@{user.username}</span></p>
        <p className="muted">
          Your account session is active. The rebuilt client experience is being restored in stages;
          your existing account data and media services remain separate from this temporary screen.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="button" onClick={signOut} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </main>
  );
}

function AppContent() {
  const account = useAccount();
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  async function finishAdministratorSetup() {
    const user = await account.refresh();
    if (!user) throw new Error('Administrator setup completed, but the new session could not be loaded.');
    window.history.replaceState({}, '', '/');
    setPathname('/');
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await authRequest<{ passwordChanged: boolean }>('/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const user = await account.refresh();
    if (!user || user.mustChangePassword) {
      throw new Error('The password was updated, but the account state could not be refreshed. Reload this page.');
    }
  }

  if (account.status === 'loading') return <LoadingPage />;

  if (account.status === 'error') {
    return <AccountErrorPage message={account.error ?? 'The account could not be loaded.'} onRetry={() => { void account.refresh().catch(() => undefined); }} />;
  }

  if (account.status === 'signed-out' || !account.user) {
    if (pathname === '/setup/admin') {
      return <AdminSetupPage onComplete={finishAdministratorSetup} />;
    }
    return <LoginPage onLogin={account.login} />;
  }

  if (account.user.mustChangePassword) {
    return (
      <PasswordChangePage
        username={account.user.username}
        onChangePassword={changePassword}
        onLogout={account.logout}
      />
    );
  }

  return <SignedInPage user={account.user} onLogout={account.logout} />;
}

export default function App() {
  return (
    <AccountProvider>
      <AppContent />
    </AccountProvider>
  );
}
