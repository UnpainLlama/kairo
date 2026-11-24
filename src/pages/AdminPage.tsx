import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
      setNotice('Account created. Copy the temporary password and share it with the intended user securely.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the account.');
    } finally {
      setBusy('');
    }
  }

  async function resetPassword(account: Account) {
    if (!window.confirm('Create a new temporary password for @' + account.username + '? The old password will stop working immediately.')) return;
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
      setNotice('Password reset. The account must change this temporary password at next sign-in.');
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
      setNotice(next === 'suspended' ? 'Account suspended and its active sessions revoked.' : 'Account reactivated.');
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
      setNotice('Account and its account-owned data were deleted. A minimal identity tombstone was retained.');
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
      setNotice('Temporary password copied. Store and deliver it securely; it will not be shown again after leaving this page.');
    } catch {
      setError('Clipboard access was blocked. Select and copy the temporary password manually.');
    }
  }

  const count = data?.standardAccountCount ?? 0;
  const limit = data?.standardAccountLimit ?? 15;

  return (
    <main className="kc-admin-page">
      <header className="kc-page-head">
        <p className="kc-section-kicker">PRIVATE CONSOLE</p>
        <h1>Kairo administration</h1>
        <p>Manage usernames, temporary passwords and the 15 standard-account allocation.</p>
      </header>

      {error && <p className="kc-auth-error" role="alert">{error}</p>}
      {notice && <p className="kc-admin-notice" role="status">{notice}</p>}

      {temporaryCredential && (
        <section className="kc-admin-credential" aria-label="Temporary account password">
          <div>
            <span className="kc-section-kicker">TEMPORARY CREDENTIAL · SHOW ONCE</span>
            <h2>@{temporaryCredential.username}</h2>
            <code>{temporaryCredential.temporaryPassword}</code>
            <p>Require the user to replace this temporary password with a private five-word passphrase at first sign-in.</p>
          </div>
          <button className="kc-btn kc-btn-primary" type="button" onClick={() => { void copyTemporaryPassword(); }}>
            <Copy size={15} /> Copy password
          </button>
        </section>
      )}

      <section className="kc-admin-card">
        <div className="kc-admin-heading">
          <div>
            <span className="kc-section-kicker">ACCOUNT ALLOCATION</span>
            <h2>Standard accounts</h2>
          </div>
          <strong>{count} / {limit}</strong>
        </div>
        <div className="kc-admin-meter"><span style={{ width: Math.min(100, limit > 0 ? count / limit * 100 : 0) + '%' }} /></div>
        <p className="kc-admin-muted">Suspended accounts continue to count toward the 15-account limit.</p>
        <form className="kc-admin-create" onSubmit={event => { void createAccount(event); }}>
          <label>Username<input value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={32} autoCapitalize="none" autoComplete="off" required /></label>
          <label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={2} maxLength={40} autoComplete="off" required /></label>
          <button className="kc-btn kc-btn-primary" disabled={busy === 'create' || count >= limit}>
            <UserPlus size={15} /> {busy === 'create' ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </section>

      <section className="kc-admin-card">
        <div className="kc-admin-heading">
          <div><span className="kc-section-kicker">USER ACCESS</span><h2>Account management</h2></div>
          <button className="kc-icon-btn" type="button" onClick={() => { void load(); }} disabled={loading} aria-label="Refresh accounts"><RefreshCw size={15} /></button>
        </div>
        {loading ? <p className="kc-admin-muted">Loading accounts…</p> :
          !data?.accounts.length ? <p className="kc-admin-muted">No standard accounts have been created.</p> :
          <div className="kc-admin-list">
            {data.accounts.map(account => (
              <article className="kc-admin-row" key={account.id}>
                <div className="kc-admin-account">
                  <strong>{account.displayName}</strong>
                  <span>@{account.username} · {account.status}</span>
                  <small>{account.credentialsConfigured ? (account.mustChangePassword ? 'Temporary password outstanding' : 'Password configured') : 'Credentials not configured'} · Created {new Date(account.createdAt).toLocaleDateString()}</small>
                </div>
                <div className="kc-admin-actions">
                  <button className="kc-btn" type="button" disabled={busy === account.id || !account.credentialsConfigured} onClick={() => { void resetPassword(account); }}>
                    <KeyRound size={14} /> Reset password
                  </button>
                  <button className="kc-btn" type="button" disabled={busy === account.id} onClick={() => { void setStatus(account); }}>
                    <ShieldCheck size={14} /> {account.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </button>
                  <button className="kc-btn kc-btn-danger" type="button" disabled={busy === account.id} onClick={() => { void deleteAccount(account); }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>}
      </section>
    </main>
  );
}
