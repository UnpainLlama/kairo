import { useState, type FormEvent } from 'react';
import { isPasswordAllowed } from '../lib/passwordRules';

type Props = {
  username: string;
  onChangePassword(currentPassword: string, newPassword: string): Promise<void>;
  onLogout(): Promise<void>;
};

export default function PasswordChangePage({ username, onChangePassword, onLogout }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!isPasswordAllowed(newPassword, username)) {
      setError('Use at least 15 characters, no more than 1024 UTF-8 bytes, and a password different from your username.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The password could not be changed. Please try again.');
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
          This account has a temporary password. Set a private password before continuing to Kairo.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="current-password">Temporary password</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <p className="form-hint">At least 15 characters. Do not reuse your username.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Updating password…' : 'Update password'}
          </button>
        </form>
        <button className="text-button" type="button" onClick={signOut} disabled={busy}>Sign out instead</button>
      </section>
    </main>
  );
}
