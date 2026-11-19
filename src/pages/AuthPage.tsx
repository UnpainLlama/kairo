import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useKairoAccount } from '../lib/AccountProvider';

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

function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('\u0000')) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin ? parsed.pathname + parsed.search + parsed.hash : null;
  } catch {
    return null;
  }
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const account = useKairoAccount();
  const params = new URLSearchParams(location.search);
  const setupMode = params.get('setup') === 'admin';
  const continuation = params.get('continue');
  const youtubeState = params.get('youtube');
  const reauthStage = params.get('reauth');
  const needsReauthentication = reauthStage === 'required' || youtubeState === 'reauth_required';
  const waitingForAccessLogin = reauthStage === 'login';
  const [displayName, setDisplayName] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const encodedContinuation = encodeURIComponent(continuation ?? '');
  const loginReturnUrl = `${window.location.origin}/login?reauth=complete&continue=${encodedContinuation}`;
  const accessLoginUrl = `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(loginReturnUrl)}`;
  const logoutReturnUrl = `${window.location.origin}/login?reauth=login&continue=${encodedContinuation}`;
  const accessLogoutUrl = `/cdn-cgi/access/logout?returnTo=${encodeURIComponent(logoutReturnUrl)}`;

  useEffect(() => {
    if (setupMode || account.status !== 'signed-in' || needsReauthentication || waitingForAccessLogin) return;

    if (continuation === 'youtube-connect' &&
        (reauthStage === 'complete' || youtubeState === 'sign_in_required')) {
      window.location.assign('/api/v1/auth/youtube');
      return;
    }
    if (continuation === 'admin') {
      currentAdminPath().then(path => navigate(path, { replace: true })).catch(caught => {
        setError(caught instanceof Error ? caught.message : 'Administrator access is temporarily unavailable.');
      });
      return;
    }
    if (reauthStage === 'complete') {
      const destination = safeInternalPath(continuation);
      navigate(destination ?? '/', { replace: true });
      return;
    }
    if (!continuation) navigate('/', { replace: true });
  }, [account.status, continuation, navigate, needsReauthentication, reauthStage, setupMode, waitingForAccessLogin, youtubeState]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post('/api/v1/admin/bootstrap', { displayName }, { 'X-Kairo-Bootstrap': bootstrapToken });
      window.dispatchEvent(new Event('kairo:auth-change'));
      navigate(await currentAdminPath(), { replace: true });
      return;
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
        <h1>{setupMode ? 'Set up administrator' : needsReauthentication ? 'Refresh your Access session' : waitingForAccessLogin ? 'Continue with Cloudflare Access' : 'Your Kairo access'}</h1>
        <p className="kc-auth-copy">
          {setupMode
            ? 'One-time administrator provisioning. The verified Cloudflare Access email is the administrator identity; no Kairo username or password is created. This setup closes permanently after creation.'
            : needsReauthentication
              ? 'This action needs a freshly established Kairo session. Sign out of Cloudflare Access, then sign back in with the approved email address. You will be returned here to continue.'
              : waitingForAccessLogin
                ? 'Your previous Access session has been cleared. Continue with the approved email address to create a fresh Kairo session.'
                : 'Kairo sign-in is handled by Cloudflare Access. Use the individually approved email address you were invited with; your Kairo account and personal libraries load automatically. No separate Kairo username or password is required.'}
        </p>
        {setupMode ? <form onSubmit={submit}>
          <label>Display name
            <input
              autoComplete="name"
              minLength={2}
              maxLength={40}
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
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
          {error && <p className="kc-auth-error" role="alert">{error}</p>}
          {notice && <p className="kc-auth-copy" role="status">{notice}</p>}
          <button className="kc-auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Create administrator'}
          </button>
        </form> : needsReauthentication ? (
          <div className="kc-auth-copy">
            <a className="kc-auth-submit" href={accessLogoutUrl}>Sign out and re-authenticate</a>
            <p>This signs out of Cloudflare Access for this browser session. Your saved Kairo account data remains on the server.</p>
          </div>
        ) : (
          <div className="kc-auth-copy">
            <a className="kc-auth-submit" href={accessLoginUrl}>Continue with approved email</a>
            {continuation === 'youtube-connect' && <p>After Access confirms your identity, Kairo will continue the YouTube connection.</p>}
            {continuation && continuation !== 'youtube-connect' && <p>After Access confirms your identity, you will return to the page you requested.</p>}
            {!continuation && <p>Already authenticated? <Link to="/">Return to Kairo</Link> and refresh your account state.</p>}
          </div>
        )}
        {setupMode && <p className="kc-auth-copy">Already set up? <Link to="/login">Return to Kairo</Link></p>}
        {error && !setupMode && <p className="kc-auth-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
