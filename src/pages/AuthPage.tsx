import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

type Envelope = {
  success?: boolean;
  data?: { signedIn?: boolean; administrator?: boolean; path?: string };
  error?: { message?: string };
};

async function post(path: string, body: Record<string, string>, extraHeaders: Record<string, string> = {}): Promise<Envelope> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as Envelope | null;
  if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'The request could not be completed.');
  return payload;
}

async function currentAdminPath(): Promise<string> {
  const response = await fetch('/api/v1/admin/console-path', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as Envelope | null;
  if (!response.ok || !payload?.success || typeof payload.data?.path !== 'string' ||
      !/^\/[A-Za-z0-9_-]{32,128}$/.test(payload.data.path)) {
    throw new Error('Administrator access is temporarily unavailable. Please try again.');
  }
  return payload.data.path;
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setupMode = new URLSearchParams(location.search).get('setup') === 'admin';
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accessEmail, setAccessEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (setupMode) {
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        await post('/api/v1/admin/bootstrap', { username, displayName, accessEmail, password }, { 'X-Kairo-Bootstrap': bootstrapToken });
        window.dispatchEvent(new Event('kairo:auth-change'));
        navigate(await currentAdminPath(), { replace: true });
        return;
      }
      const result = await post('/api/v1/auth/login', { username, password });
      window.dispatchEvent(new Event('kairo:auth-change'));
      if (result.data?.administrator) {
        navigate(await currentAdminPath(), { replace: true });
      } else {
        navigate('/profile', { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="kc-auth">
      <div className="kc-auth-card">
        <Link to="/" className="kc-auth-brand"><img src="/kairo-k.svg" alt="" width="24" height="28" />Kairo</Link>
        <h1>{setupMode ? 'Set up administrator' : 'Welcome back'}</h1>
        <p className="kc-auth-copy">
          {setupMode
            ? 'Create the single administrator account and bind it to the Gmail address allowed by Cloudflare Access. This setup closes permanently after the account is created.'
            : 'Sign in with the username and password provided for your account.'}
        </p>
        <form onSubmit={submit}>
          <label>Username
            <input
              autoComplete="username"
              required
              minLength={3}
              maxLength={64}
              value={username}
              onChange={event => setUsername(event.target.value)}
            />
          </label>
          {setupMode && (
            <>
              <label>Display name
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={40}
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                />
              </label>
              <label>Approved Cloudflare Access email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={accessEmail}
                  onChange={event => setAccessEmail(event.target.value)}
                />
              </label>
              <label>One-time setup token
                <input
                  type="password"
                  autoComplete="off"
                  required
                  value={bootstrapToken}
                  onChange={event => setBootstrapToken(event.target.value)}
                />
              </label>
            </>
          )}
          <label>Password
            <input
              type="password"
              autoComplete={setupMode ? 'new-password' : 'current-password'}
              required
              minLength={setupMode ? 15 : 1}
              maxLength={1024}
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
          {setupMode && (
            <label>Confirm password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={15}
                maxLength={1024}
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
              />
            </label>
          )}
          {error && <p className="kc-auth-error" role="alert">{error}</p>}
          {notice && <p className="kc-auth-copy" role="status">{notice}</p>}
          <button className="kc-auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : setupMode ? 'Create administrator' : 'Sign in'}
          </button>
        </form>
        <p className="kc-auth-copy">
          {setupMode
            ? <>Already set up? <Link to="/login">Return to sign in</Link></>
            : <>First-time setup? <Link to="/login?setup=admin">Create the administrator account</Link></>}
        </p>
      </div>
    </section>
  );
}
