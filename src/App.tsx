import { BrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import PasswordChangePage from './components/PasswordChangePage';
import PreMiruroApp from './components/PreMiruroApp';
import { AccountProvider, useAccount, type AccountUser } from './lib/AccountProvider';
import { AuthApiError, authRequest } from './lib/authClient';

function LoadingPage() {
  return <main className="auth-shell" aria-live="polite"><section className="auth-panel"><img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" /><p className="eyebrow">KAIRO</p><h1>Checking your account…</h1><p className="muted">Your session is being verified securely.</p></section></main>;
}

function AccountErrorPage({ message, onRetry }: { message: string; onRetry(): void }) {
  return <main className="auth-shell"><section className="auth-panel" aria-labelledby="account-error-heading"><img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" /><p className="eyebrow">KAIRO</p><h1 id="account-error-heading">Account unavailable</h1><p className="form-error" role="alert">{message}</p><button className="primary-button" type="button" onClick={onRetry}>Try again</button></section></main>;
}

function AppContent() {
  const account = useAccount();
  const location = useLocation();
  const navigate = useNavigate();

  async function changePassword(currentPassword: string, newPassword: string) {
    const result = await authRequest<{ passwordChanged: boolean }>('/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (result.data.passwordChanged !== true) {
      throw new AuthApiError(502, 'PASSWORD_CHANGE_UNCONFIRMED', 'Kairo did not confirm that the new password was saved. Keep this page open and try again.');
    }

    let user: AccountUser | null;
    try {
      // Do not replace the password-change screen with a generic account error if
      // the password was saved but the follow-up profile read is temporarily down.
      user = await account.refresh(undefined, { preserveSignedInOnError: true });
    } catch {
      throw new Error('Your new password was saved, but Kairo could not reload your account details. Select “Sign out instead”, then sign in with the new passphrase.');
    }

    if (!user) {
      // The password update succeeded but the session is no longer valid.
      navigate('/login', { replace: true });
      return;
    }
    if (user.mustChangePassword) {
      throw new Error('Kairo still reports that a password change is required. Sign out and sign in again with the new passphrase. If this repeats, the deployed Worker and D1 database may be out of sync.');
    }

    // A successful refresh changes the account state; return to the Kairo home
    // route rather than leaving the user on a stale login/setup URL.
    navigate('/', { replace: true });
  }

  if (account.status === 'loading') return <LoadingPage />;
  if (account.status === 'error') {
    return <AccountErrorPage message={account.error ?? 'The account could not be loaded.'} onRetry={() => { void account.refresh().catch(() => undefined); }} />;
  }
  if (account.status === 'signed-out' || !account.user) {
    if (location.pathname !== '/login') return <Navigate to='/login' replace />;
    return <LoginPage onLogin={account.login} />;
  }
  if (account.user.mustChangePassword) {
    return <PasswordChangePage username={account.user.username} onChangePassword={changePassword} onLogout={account.logout} />;
  }
  if (location.pathname === '/login' || location.pathname === '/setup/admin') return <Navigate to='/' replace />;
  return <PreMiruroApp onSignOut={account.logout} />;
}

export default function App() {
  return <BrowserRouter><AccountProvider><AppContent /></AccountProvider></BrowserRouter>;
}
