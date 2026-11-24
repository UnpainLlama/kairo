import { useState, type FormEvent } from 'react';
import { AuthApiError } from '../lib/authClient';
import { validatePasswordChange } from '../lib/passwordRules';

type Props = {
  username: string;
  onChangePassword(currentPassword: string, newPassword: string): Promise<void>;
  onLogout(): Promise<void>;
};

function passwordChangeError(reason: unknown): string {
  if (!(reason instanceof AuthApiError)) {
    return reason instanceof Error ? reason.message : 'The password could not be changed. Please try again.';
  }

  switch (reason.code) {
    case 'CURRENT_PASSWORD_INCORRECT':
      return 'The temporary password was not accepted. Re-enter it exactly as provided.';
    case 'VALIDATION_ERROR':
      return 'Kairo rejected the new passphrase. It must contain at least five space-separated words, fit within 1,024 UTF-8 bytes, and differ from your username.';
    case 'PASSWORD_UNCHANGED':
      return 'Choose a new passphrase that is different from your temporary password.';
    case 'PASSWORD_CHANGE_CONFLICT':
      return 'The credential changed during this request. Sign out and sign in again with the password that is now active.';
    case 'AUTH_REQUIRED':
      return 'Your Kairo session has expired. Sign in again before changing the password.';
    case 'ORIGIN_FORBIDDEN':
      return 'Kairo rejected this request because its page origin did not match the API. Open the staging site directly and try again.';
    case 'AUTH_REDIRECT':
      return 'The password request was redirected to a login page instead of reaching Kairo. Refresh the staging site and sign in again. If this repeats, the Cloudflare Access route may be intercepting the API request.';
    case 'NETWORK_ERROR':
      return 'The connection was interrupted, so Kairo could not confirm whether the password was saved. Sign out and try signing in with the new passphrase before retrying the change.';
    case 'AUTH_UNAVAILABLE':
    case 'API_UNAVAILABLE':
      return 'Kairo authentication is temporarily unavailable. Try again when the service is available.';
    case 'NON_JSON_RESPONSE':
      return 'Kairo received a web page instead of an API response. Refresh the staging site; check its Worker deployment and Cloudflare Access routing if this continues.';
    case 'API_ROUTE_NOT_FOUND':
      return 'The password-change API was not found. The staging Worker may not have the latest deployment.';
    case 'REQUEST_FORBIDDEN':
      return 'Kairo or its edge security layer blocked the request. Refresh the staging site and sign in again.';
    case 'PASSWORD_CHANGE_UNCONFIRMED':
      return reason.message;
    default:
      if (reason.status === 404) {
        return 'The password-change API was not found. The staging Worker may not have the latest deployment.';
      }
      if (reason.status >= 500) {
        return 'Kairo encountered a server error while changing the password. Try again, and sign out if the problem persists.';
      }
      return reason.message || `Kairo could not change the password (HTTP ${reason.status}). Check the fields and try again.`;
  }
}

export default function PasswordChangePage({ username, onChangePassword, onLogout }: Props) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const form = event.currentTarget;
    // Read the live form controls at submit time. This avoids stale React state
    // when the browser or a password manager autofills password inputs.
    const values = new FormData(form);
    const currentPassword = String(values.get('currentPassword') ?? '');
    const newPassword = String(values.get('newPassword') ?? '');
    const confirmation = String(values.get('confirmPassword') ?? '');

    const validation = validatePasswordChange({
      currentPassword,
      newPassword,
      confirmation,
      username,
    });
    if (validation) {
      setError(validation.message);
      const invalidField = form.elements.namedItem(validation.field);
      if (invalidField instanceof HTMLElement) invalidField.focus();
      return;
    }

    setBusy(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      form.reset();
    } catch (reason) {
      setError(passwordChangeError(reason));
    } finally {
      setBusy(false);
    }
  }

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
      <section className="auth-panel" aria-labelledby="password-change-heading">
        <img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" />
        <p className="eyebrow">Account security</p>
        <h1 id="password-change-heading">Choose a new password</h1>
        <p className="muted">
          This account has a temporary password. Set a private passphrase before continuing to Kairo.
        </p>
        <form className="auth-form" onSubmit={submit} autoComplete="on">
          <label htmlFor="current-password">Temporary password</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-describedby="new-password-hint"
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <p className="form-hint" id="new-password-hint">
            Use five or more words separated by spaces. The passphrase must differ from your username and temporary password.
          </p>
          {error && <p className="form-error" role="alert" aria-live="polite">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Updating password…' : 'Update password'}
          </button>
        </form>
        <button className="text-button" type="button" onClick={signOut} disabled={busy}>
          {busy ? 'Please wait…' : 'Sign out instead'}
        </button>
      </section>
    </main>
  );
}
