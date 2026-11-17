import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Envelope = {
  success?: boolean;
  data?: { signedIn?: boolean; challengeRequired?: boolean; challengeId?: string; path?: string };
  error?: { message?: string };
};

async function post(path: string, body: Record<string, string>): Promise<Envelope> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (challengeId) {
        await post('/api/v1/auth/admin-code/verify', { username, challengeId, code });
        window.dispatchEvent(new Event('kairo:auth-change'));
        navigate(await currentAdminPath(), { replace: true });
        return;
      }

      const result = await post('/api/v1/auth/login', { username, password });
      if (result.data?.challengeRequired && typeof result.data.challengeId === 'string') {
        setChallengeId(result.data.challengeId);
        setPassword('');
        setCode('');
        setNotice('A one-time verification code has been sent to the administrator mailbox. It expires in five minutes.');
        return;
      }

      window.dispatchEvent(new Event('kairo:auth-change'));
      navigate('/profile', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await post('/api/v1/auth/login', { username, password: '' });
      if (result.data?.challengeRequired && typeof result.data.challengeId === 'string') {
        setChallengeId(result.data.challengeId);
        setCode('');
        setNotice('A new verification code has been sent. The previous code is no longer valid.');
      }
    } catch (caught) {
      setChallengeId(null);
      setCode('');
      setError(caught instanceof Error ? caught.message : 'Could not resend the verification code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="kc-auth">
      <div className="kc-auth-card">
        <Link to="/" className="kc-auth-brand"><img src="/kairo-k.svg" alt="" width="24" height="28" />Kairo</Link>
        <h1>{challengeId ? 'Verify administrator' : 'Welcome back'}</h1>
        <p className="kc-auth-copy">
          {challengeId
            ? 'Enter the eight-digit code sent to the administrator mailbox.'
            : 'Standard accounts use a username and password. The administrator signs in with an emailed one-time code.'}
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
              readOnly={Boolean(challengeId)}
            />
          </label>
          {!challengeId ? (
            <label>Password
              <input
                type="password"
                autoComplete="current-password"
                maxLength={1024}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
            </label>
          ) : (
            <label>Verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{8}"
                minLength={8}
                maxLength={8}
                required
                value={code}
                onChange={event => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                autoFocus
              />
            </label>
          )}
          {error && <p className="kc-auth-error" role="alert">{error}</p>}
          {notice && <p className="kc-auth-copy" role="status">{notice}</p>}
          <button className="kc-auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : challengeId ? 'Verify and continue' : 'Continue'}
          </button>
          {challengeId && (
            <div className="kc-auth-actions">
              <button type="button" className="kc-auth-submit" disabled={busy} onClick={() => void resendCode()}>Resend code</button>
              <button type="button" className="kc-auth-submit" disabled={busy} onClick={() => { setChallengeId(null); setCode(''); setNotice(''); setError(''); }}>Use another username</button>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
