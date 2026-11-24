import { useState, type FormEvent } from 'react';
import { authRequest } from '../lib/authClient';
import { isPasswordAllowed } from '../lib/passwordRules';

type Props = {
  onComplete(): Promise<void>;
};

export default function AdminSetupPage({ onComplete }: Props) {
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [username, setUsername] = useState('admin');
  const [displayName, setDisplayName] = useState('Kairo Administrator');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (bootstrapToken.length < 32) {
      setError('Enter the one-time setup token supplied by the site operator.');
      return;
    }
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
      setError('Username must be 3–32 letters, numbers, dots, hyphens or underscores.');
      return;
    }
    if (!isPasswordAllowed(password, username)) {
      setError('Use at least 15 characters, no more than 1024 UTF-8 bytes, and a password different from the username.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await authRequest<{ created: boolean; signedIn: boolean }>('/admin/bootstrap', {
        method: 'POST',
        headers: { 'X-Kairo-Bootstrap': bootstrapToken },
        body: JSON.stringify({ username, displayName, password }),
      });
      setBootstrapToken('');
      setPassword('');
      setConfirmation('');
      await onComplete();
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : 'Administrator setup was not accepted. Check the token and confirm setup is still enabled.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="admin-setup-heading">
        <img className="brand-mark" src="/kairo-k.svg" alt="" width="44" height="48" />
        <p className="eyebrow">One-time setup</p>
        <h1 id="admin-setup-heading">Create the administrator</h1>
        <p className="muted">
          This page works only while initial setup is enabled. The one-time token is checked by the server
          and is never saved in browser storage or included in the application bundle.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="bootstrap-token">One-time setup token</label>
          <input
            id="bootstrap-token"
            name="bootstrapToken"
            type="password"
            autoComplete="off"
            required
            minLength={32}
            value={bootstrapToken}
            onChange={(event) => setBootstrapToken(event.target.value)}
          />
          <label htmlFor="admin-username">Administrator username</label>
          <input
            id="admin-username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={32}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <label htmlFor="admin-display-name">Display name</label>
          <input
            id="admin-display-name"
            name="displayName"
            autoComplete="name"
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <label htmlFor="admin-password">Administrator password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label htmlFor="admin-password-confirm">Confirm administrator password</label>
          <input
            id="admin-password-confirm"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <p className="form-hint">Use a unique password of at least 15 characters.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Creating administrator…' : 'Create administrator'}
          </button>
        </form>
        <a className="subtle-link" href="/">Back to sign in</a>
      </section>
    </main>
  );
}
