import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Copy, KeyRound, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { authRequest } from '../lib/authClient';

type Account = {
  id: string;
  username: string;
  displayName: string;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: string;
  credentialsConfigured: number;
  mustChangePassword: number;
};
type AccountsPayload = {
  accounts: Account[];
  standardAccountCount: number;
  standardAccountLimit: number;
};
type TemporaryCredential = { username: string; temporaryPassword: string; accountId: string };

export default function AdminPage() {
  const [data, setData] = useState<AccountsPayload | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [temporaryCredential, setTemporaryCredential] = useState<TemporaryCredential | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authRequest<AccountsPayload>('/admin/accounts', { method: 'GET' });
      setData(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('create');
    setError('');
    setNotice('');
    setTemporaryCredential(null);
    try {
      const result = await authRequest<TemporaryCredential & { created: boolean; mustChangePassword: boolean }>('/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({ username, displayName }),
      });
      setTemporaryCredential({
        accountId: result.data.accountId,
        username: result.data.username,
        temporaryPassword: result.data.temporaryPassword,
      });
      setUsername('');
      setDisplayName('');
      setNotice('Account created. Copy its temporary password and deliver it securely.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the account.');
    } finally {
      setBusy('');
    }
  }

  async function resetPassword(account: Account) {
    if (!window.confirm('Reset the password for @' + account.username + '? The current password will stop working immediately.')) return;
    setBusy(account.id);
    setError('');
    setNotice('');
    setTemporaryCredential(null);
    try {
      const result = await authRequest<{ reset: boolean; accountId: string; temporaryPassword: string; mustChangePassword: boolean }>(
        '/admin/accounts/' + encodeURIComponent(account.id) + '/password',
        { method: 'POST' },
      );
      setTemporaryCredential({ accountId: account.id, username: account.username, temporaryPassword: result.data.temporaryPassword });
      setNotice('Password reset. The user must change the temporary password at next sign-in.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset the password.');
    } finally {
      setBusy('');
    }
  }

  async function setStatus(account: Account) {
    const next = account.status === 'active' ? 'suspended' : 'active';
    if (!window.confirm((next === 'suspended' ? 'Suspend' : 'Reactivate') + ' @' + account.username + '?')) return;
    setBusy(account.id);
    setError('');
    setNotice('');
    try {
      await authRequest('/admin/accounts/' + encodeURIComponent(account.id) + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      setNotice(next === 'suspended' ? 'Account suspended and active sessions revoked.' : 'Account reactivated.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the account.');
    } finally {
      setBusy('');
    }
  }

  async function deleteAccount(account: Account) {
    if (!window.confirm('Permanently delete @' + account.username + ' and erase its account-owned data? This cannot be undone.')) return;
    setBusy(account.id);
    setError('');
    setNotice('');
    try {
      await authRequest('/admin/accounts/' + encodeURIComponent(account.id), {
        method: 'DELETE',
        body: JSON.stringify({ confirmDataDeletion: true }),
      });
      setNotice('Account data deleted. A minimal identity tombstone was retained.');
      setTemporaryCredential(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the account.');
    } finally {
      setBusy('');
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryCredential) return;
    try {
      await navigator.clipboard.writeText(temporaryCredential.temporaryPassword);
      setNotice('Temporary password copied. Store and deliver it securely; it will only be shown here once.');
    } catch {
      setError('Clipboard access was blocked. Select and copy the temporary password manually.');
    }
  }

  const count = data?.standardAccountCount ?? 0;
  const limit = data?.standardAccountLimit ?? 15;
  const panel: CSSProperties = { width: 'min(1080px, calc(100% - 32px))', margin: '40px auto', color: '#f4f4f5', fontFamily: 'system-ui, sans-serif' };
  const surface: CSSProperties = { background: '#171719', border: '1px solid #303034', borderRadius: 14, padding: 22, marginBottom: 18 };
  const field: CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px 12px', marginTop: 6, background: '#101012', color: '#fff', border: '1px solid #44444a', borderRadius: 8 };
  const button: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 14px', borderRadius: 8, border: '1px solid #55555c', background: '#29292e', color: '#fff', cursor: 'pointer' };

  return <main style={panel}>
    <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24 }}>
      <div><p style={{ color: '#a1a1aa', margin: 0, letterSpacing: 2, fontSize: 11 }}>PRIVATE CONSOLE</p><h1 style={{ margin: '6px 0' }}>Kairo administration</h1><p style={{ color: '#a1a1aa', margin: 0 }}>Manage usernames, passwords and the 15 standard accounts.</p></div>
      <button style={button} type="button" onClick={() => { void load(); }} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </header>

    {error && <p role="alert" style={{ background: '#451a1a', padding: 12, borderRadius: 8 }}>{error}</p>}
    {notice && <p role="status" style={{ background: '#173323', padding: 12, borderRadius: 8 }}>{notice}</p>}

    {temporaryCredential && <section style={{ ...surface, borderColor: '#77777f' }}>
      <p style={{ color: '#a1a1aa', margin: 0, letterSpacing: 2, fontSize: 10 }}>TEMPORARY CREDENTIAL · SHOWN ONCE</p>
      <h2 style={{ margin: '8px 0' }}>@{temporaryCredential.username}</h2>
      <code style={{ display: 'block', padding: 13, borderRadius: 8, background: '#09090b', fontSize: 15, overflowWrap: 'anywhere' }}>{temporaryCredential.temporaryPassword}</code>
      <p style={{ color: '#c4c4ca' }}>The user must change this to a private five-word passphrase at their next sign-in.</p>
      <button style={button} type="button" onClick={() => { void copyTemporaryPassword(); }}><Copy size={15}/> Copy temporary password</button>
    </section>}

    <section style={surface}>
      <h2 style={{ marginTop: 0 }}>Standard accounts</h2>
      <p style={{ color: '#c4c4ca' }}>{count} of {limit} allocated. Suspended accounts still count toward the limit.</p>
      <div style={{ height: 7, background: '#303034', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: Math.min(100, limit > 0 ? count / limit * 100 : 0) + '%', background: '#a1a1aa' }}/></div>
      <form onSubmit={event => { void createAccount(event); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', alignItems: 'end', gap: 12, marginTop: 20 }}>
        <label>Username<input style={field} value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={32} autoCapitalize="none" autoComplete="off" required /></label>
        <label>Display name<input style={field} value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={2} maxLength={40} autoComplete="off" required /></label>
        <button style={button} disabled={busy === 'create' || count >= limit}><UserPlus size={15}/>{busy === 'create' ? 'Creating…' : 'Create account'}</button>
      </form>
    </section>

    <section style={surface}>
      <h2 style={{ marginTop: 0 }}>Manage accounts</h2>
      {loading ? <p>Loading accounts…</p> : !data?.accounts.length ? <p style={{ color: '#a1a1aa' }}>No standard accounts have been created.</p> : data.accounts.map(account => <article key={account.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: '1px solid #303034' }}>
        <div><strong>{account.displayName}</strong><div style={{ color: '#a1a1aa', fontSize: 13 }}>@{account.username} · {account.status}</div><small style={{ color: '#a1a1aa' }}>{account.credentialsConfigured ? (account.mustChangePassword ? 'Temporary password outstanding' : 'Password configured') : 'Credentials not configured'} · Created {new Date(account.createdAt).toLocaleDateString()}</small></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button style={button} type="button" disabled={busy === account.id || !account.credentialsConfigured} onClick={() => { void resetPassword(account); }}><KeyRound size={14}/> Reset password</button>
          <button style={button} type="button" disabled={busy === account.id} onClick={() => { void setStatus(account); }}><ShieldCheck size={14}/>{account.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
          <button style={{ ...button, borderColor: '#744747' }} type="button" disabled={busy === account.id} onClick={() => { void deleteAccount(account); }}><Trash2 size={14}/> Delete</button>
        </div>
      </article>)}
    </section>
  </main>;
}
