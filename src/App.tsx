import { BrowserRouter, Navigate, useLocation } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import PasswordChangePage from './components/PasswordChangePage';
import KairoApp from './components/KairoApp';
import { AccountProvider, useAccount } from './lib/AccountProvider';
import { authRequest } from './lib/authClient';

function LoadingPage() {
  return <main className="auth-shell" aria-live="polite"><section className="auth-panel"><img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" /><p className="eyebrow">KAIRO</p><h1>Checking your account…</h1><p className="muted">Your session is being verified securely.</p></section></main>;
}

function AccountErrorPage({ message, onRetry }: { message: string; onRetry(): void }) {
  return <main className="auth-shell"><section className="auth-panel" aria-labelledby="account-error-heading"><img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" /><p className="eyebrow">KAIRO</p><h1 id="account-error-heading">Account unavailable</h1><p className="form-error" role="alert">{message}</p><button className="primary-button" type="button" onClick={onRetry}>Try again</button></section></main>;
}

function AppContent() {
  const account = useAccount();
  const location = useLocation();
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
    if (location.pathname === '/setup/admin') return <Navigate to='/login' replace />;
    return <LoginPage onLogin={account.login} />;
  }
  if (account.user.mustChangePassword) {
    return <PasswordChangePage username={account.user.username} onChangePassword={changePassword} onLogout={account.logout} />;
  }
  if (location.pathname === '/login' || location.pathname === '/setup/admin') return <Navigate to="/" replace />;
  return <KairoApp />;
}

export default function App() {
  return <BrowserRouter><AccountProvider><AppContent /></AccountProvider></BrowserRouter>;
}
