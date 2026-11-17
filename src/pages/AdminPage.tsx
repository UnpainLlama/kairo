import { useCallback, useEffect, useState, type FormEvent, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

type Account = { id: string; username: string; displayName: string; status: 'active' | 'suspended'; createdAt: string };
type Payload = { success?: boolean; data?: { accounts?: Account[]; standardAccountCount?: number; standardAccountLimit?: number; account?: Account }; error?: { message?: string } };

async function request(path: string, method = 'GET', body?: unknown): Promise<Payload> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as Payload | null;
  if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'The request could not be completed.');
  return payload;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(15);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const payload = await request('/api/v1/admin/accounts');
      setAccounts(payload.data?.accounts ?? []);
      setCount(payload.data?.standardAccountCount ?? 0);
      setLimit(payload.data?.standardAccountLimit ?? 15);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load accounts.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    document.title = 'Kairo Administration';
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    meta.content = 'noindex, nofollow, noarchive, nosnippet';
    void load();
    return () => { document.title = 'Kairo'; };
  }, [load]);

  async function createAccount(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/v1/admin/accounts', 'POST', { username, displayName, password });
      setUsername(''); setDisplayName(''); setPassword('');
      setNotice('Account created. Share its credentials with the intended user through a secure channel.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create account.'); }
    finally { setBusy(false); }
  }

  async function setStatus(account: Account) {
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/v1/admin/accounts/' + encodeURIComponent(account.id) + '/status', 'PATCH', {
        status: account.status === 'active' ? 'suspended' : 'active',
      });
      setNotice(account.status === 'active' ? 'Account suspended.' : 'Account reactivated.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update account.'); }
    finally { setBusy(false); }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault(); if (!resetId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/v1/admin/accounts/' + encodeURIComponent(resetId) + '/password', 'POST', { password: resetPassword });
      setResetId(null); setResetPassword('');
      setNotice('Password reset and existing sessions revoked.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not reset password.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Could not sign out.');
      window.dispatchEvent(new Event('kairo:auth-change'));
      navigate('/login', { replace: true });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign out.'); }
    finally { setBusy(false); }
  }

  const panel: CSSProperties = { width: 'min(1080px, calc(100% - 32px))', margin: '40px auto', color: '#f4f4f5', fontFamily: 'system-ui, sans-serif' };
  const surface: React.CSSProperties = { background: '#171719', border: '1px solid #303034', borderRadius: 14, padding: 22, marginBottom: 18 };
  const field: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 12px', marginTop: 6, background: '#101012', color: '#fff', border: '1px solid #44444a', borderRadius: 8 };
  const button: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, border: '1px solid #55555c', background: '#29292e', color: '#fff', cursor: 'pointer' };

  return <main style={panel}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24 }}>
      <div><p style={{ color: '#a1a1aa', margin: 0, letterSpacing: 2, fontSize: 11 }}>PRIVATE CONSOLE</p><h1 style={{ margin: '6px 0' }}>Kairo administration</h1><p style={{ color: '#a1a1aa', margin: 0 }}>Manage the 15 standard accounts. YouTube access is reserved for the administrator.</p></div>
      <button style={button} onClick={() => void signOut()} disabled={busy}>Sign out</button>
    </header>

    {error && <p role="alert" style={{ background: '#451a1a', padding: 12, borderRadius: 8 }}>{error}</p>}
    {notice && <p role="status" style={{ background: '#173323', padding: 12, borderRadius: 8 }}>{notice}</p>}

    <section style={surface}>
      <h2 style={{ marginTop: 0 }}>Standard accounts</h2>
      <p style={{ color: '#c4c4ca' }}>{count} of {limit} allocated. Suspended accounts still count toward the limit.</p>
      <div style={{ height: 7, background: '#303034', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: Math.min(100, count / limit * 100) + '%', background: '#a1a1aa' }} /></div>
      {loading ? <p>Loading accounts…</p> : accounts.length === 0 ? <p style={{ color: '#a1a1aa' }}>No standard accounts have been created.</p> : <div style={{ marginTop: 16 }}>
        {accounts.map(account => <article key={account.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: '1px solid #303034' }}>
          <div><strong>{account.displayName}</strong><div style={{ color: '#a1a1aa', fontSize: 13 }}>@{account.username} · {account.status}</div></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button style={button} disabled={busy} onClick={() => { setResetId(resetId === account.id ? null : account.id); setResetPassword(''); }}>Reset password</button>
            <button style={button} disabled={busy} onClick={() => void setStatus(account)}>{account.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
          </div>
          {resetId === account.id && <form onSubmit={savePassword} style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input style={{ ...field, flex: '1 1 260px', marginTop: 0 }} type="password" minLength={12} maxLength={1024} autoComplete="new-password" placeholder="New password (12+ characters)" required value={resetPassword} onChange={event => setResetPassword(event.target.value)} />
            <button style={button} disabled={busy}>Save password</button>
          </form>}
        </article>)}
      </div>}
    </section>

    <section style={surface}>
      <h2 style={{ marginTop: 0 }}>Create standard account</h2>
      <p style={{ color: '#a1a1aa' }}>New accounts receive the regular Kairo interface. They do not receive administrator or YouTube permissions.</p>
      <form onSubmit={createAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label>Username<input style={field} autoComplete="off" minLength={3} maxLength={64} pattern="[A-Za-z0-9._-]+" required value={username} onChange={event => setUsername(event.target.value)} /></label>
        <label>Display name<input style={field} autoComplete="off" minLength={2} maxLength={40} required value={displayName} onChange={event => setDisplayName(event.target.value)} /></label>
        <label>Password<input style={field} type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <div style={{ display: 'flex', alignItems: 'end' }}><button style={{ ...button, width: '100%' }} disabled={busy || count >= limit}>{busy ? 'Please wait…' : count >= limit ? 'Account limit reached' : 'Create account'}</button></div>
      </form>
    </section>
  </main>;
}
