import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasActiveAccessAccount, resetAccessJwksCacheForTests, verifyCloudflareAccessAssertion } from './cloudflareAccess';

afterEach(() => {
  vi.unstubAllGlobals();
  resetAccessJwksCacheForTests();
});

function base64url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signedAccessToken(options: { email?: string; audience?: string; expiresIn?: number; tamper?: boolean; subject?: string | null } = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'test-access-key', use: 'sig', alg: 'RS256' };
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'test-access-key', typ: 'JWT' }));
  const subject = options.subject === undefined ? 'cloudflare-identity-subject' : options.subject;
  const payload = base64url(JSON.stringify({
    aud: [options.audience ?? 'kairo-test-aud'],
    email: options.email ?? 'Invited.User@Gmail.com',
    exp: now + (options.expiresIn ?? 300),
    iat: now,
    nbf: now,
    iss: 'https://kairo-team.cloudflareaccess.com',
    type: 'app',
    ...(subject === null ? {} : { sub: subject }),
  }));
  const input = header + '.' + payload;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
  const signaturePart = base64url(new Uint8Array(signature));
  const tamperedSignature = (signaturePart.startsWith('A') ? 'B' : 'A') + signaturePart.slice(1);
  const token = input + '.' + (options.tamper ? tamperedSignature : signaturePart);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })));
  return token;
}

describe('Cloudflare Access application JWT verification', () => {
  const bindings = {
    ACCESS_TEAM_DOMAIN: 'kairo-team.cloudflareaccess.com',
    ACCESS_AUD: 'kairo-test-aud',
  };

  it('accepts a valid signature, issuer and application audience and normalizes the verified email', async () => {
    const token = await signedAccessToken();
    await expect(verifyCloudflareAccessAssertion(token, bindings)).resolves.toEqual({
      email: 'invited.user@gmail.com',
      subject: 'cloudflare-identity-subject',
    });
  });

  it('rejects a token with a modified signature', async () => {
    const token = await signedAccessToken({ tamper: true });
    await expect(verifyCloudflareAccessAssertion(token, bindings)).resolves.toBeNull();
  });

  it('rejects an expired token and a token for a different Access application', async () => {
    const expired = await signedAccessToken({ expiresIn: -600 });
    await expect(verifyCloudflareAccessAssertion(expired, bindings)).resolves.toBeNull();
    resetAccessJwksCacheForTests();
    const wrongAudience = await signedAccessToken({ audience: 'another-app-aud' });
    await expect(verifyCloudflareAccessAssertion(wrongAudience, bindings)).resolves.toBeNull();
  });

  it('rejects a token from an unconfigured issuer domain', async () => {
    const token = await signedAccessToken();
    await expect(verifyCloudflareAccessAssertion(token, {
      ACCESS_TEAM_DOMAIN: 'attacker.example',
      ACCESS_AUD: 'kairo-test-aud',
    })).resolves.toBeNull();
  });

  it('rejects signed tokens with a missing or invalid Access subject', async () => {
    const missingSubject = await signedAccessToken({ subject: null });
    await expect(verifyCloudflareAccessAssertion(missingSubject, bindings)).resolves.toBeNull();

    resetAccessJwksCacheForTests();
    const blankSubject = await signedAccessToken({ subject: '   ' });
    await expect(verifyCloudflareAccessAssertion(blankSubject, bindings)).resolves.toBeNull();

    resetAccessJwksCacheForTests();
    const oversizedSubject = await signedAccessToken({ subject: 's'.repeat(256) });
    await expect(verifyCloudflareAccessAssertion(oversizedSubject, bindings)).resolves.toBeNull();
  });

  it('rejects missing tokens and incomplete configuration without network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyCloudflareAccessAssertion(null, bindings)).resolves.toBeNull();
    await expect(verifyCloudflareAccessAssertion('token', { ACCESS_TEAM_DOMAIN: bindings.ACCESS_TEAM_DOMAIN })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Cloudflare Access account resolution', () => {
  function memoryDb(initial: Array<{id:string;email:string|null;accessEmail:string|null;accessSubject?:string|null;accountStatus:string;role:'user'|'admin'}> = [], rejectInsert = false, bootstrapPending = false) {
    const rows = initial.map(row => ({ ...row }));
    const statements: string[] = [];
    const db = {
      rows,
      statements,
      prepare(sql: string) {
        statements.push(sql);
        const statement = (values: unknown[] = []) => ({
          first: async () => {
            if (sql.includes('FROM app_security_state')) {
              return bootstrapPending ? { completedAt: null, adminExists: 0 } : null;
            }
            if (sql.includes('WHERE access_email = ?')) {
              const email = String(values[0]).toLowerCase();
              const row = rows.find(item => item.accessEmail?.toLowerCase() === email);
              return row ? { id: row.id, accountStatus: row.accountStatus, accessSubject: row.accessSubject ?? null } : null;
            }
            if (sql.includes('WHERE email = ?')) {
              const email = String(values[0]).toLowerCase();
              const row = rows.find(item => item.email?.toLowerCase() === email);
              return row ? { id: row.id, accountStatus: row.accountStatus, accessEmail: row.accessEmail, accessSubject: row.accessSubject ?? null } : null;
            }
            if (sql.includes('FROM user_profiles WHERE id = ?')) {
              const row = rows.find(item => item.id === String(values[0]));
              return row ? { id: row.id, accountStatus: row.accountStatus, accessSubject: row.accessSubject ?? null } : null;
            }
            return null;
          },
          run: async () => {
            if (sql.includes('UPDATE user_profiles SET access_subject')) {
              const subject = String(values[0]);
              const id = String(values[1]);
              const row = rows.find(item => item.id === id && !item.accessSubject);
              if (row) row.accessSubject = subject;
              return { meta: { changes: row ? 1 : 0 } };
            }
            if (sql.includes('UPDATE user_profiles SET access_email')) {
              const email = String(values[0]);
              const subject = String(values[1]);
              const id = String(values[2]);
              const row = rows.find(item => item.id === id && item.accessEmail === null);
              if (row) { row.accessEmail = email; row.accessSubject = subject; }
              return { meta: { changes: row ? 1 : 0 } };
            }
            if (sql.includes('UPDATE sessions SET access_subject')) return { meta: { changes: 0 } };
            if (sql.includes('INSERT OR IGNORE INTO user_profiles')) {
              if (rejectInsert) throw new Error('account allocation limit reached');
              const [id, _identitySubject, _displayName, email, _username, accessEmail, accessSubject] = values as string[];
              if (!rows.some(item => item.accessEmail?.toLowerCase() === accessEmail.toLowerCase())) {
                rows.push({ id, email, accessEmail, accessSubject, accountStatus: 'active', role: 'user' });
              }
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
        });
        return {
          ...statement(),
          bind: (...values: unknown[]) => statement(values),
        };
      },
    };
    return db as unknown as D1Database & { rows: typeof rows; statements: string[] };
  }

  it('keeps an existing active account and preserves its role', async () => {
    const db = memoryDb([{
      id: 'admin-account', email: 'admin@gmail.com', accessEmail: 'admin@gmail.com', accessSubject: 'subject-1',
      accountStatus: 'active', role: 'admin',
    }]);
    await expect(hasActiveAccessAccount(db, 'ADMIN@gmail.com', 'subject-1')).resolves.toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].role).toBe('admin');
  });

  it('does not reactivate a suspended account', async () => {
    const db = memoryDb([{
      id: 'suspended-account', email: 'member@gmail.com', accessEmail: 'member@gmail.com', accessSubject: 'subject-1',
      accountStatus: 'suspended', role: 'user',
    }]);
    await expect(hasActiveAccessAccount(db, 'member@gmail.com', 'subject-1')).resolves.toBe(false);
    expect(db.rows).toHaveLength(1);
  });

  it('does not claim the first administrator email as a standard account before bootstrap', async () => {
    const db = memoryDb([], false, true);
    await expect(hasActiveAccessAccount(db, 'first.admin@gmail.com', 'subject-1')).resolves.toBe(true);
    expect(db.rows).toHaveLength(0);
    expect(db.statements.some(sql => sql.includes('FROM app_security_state'))).toBe(true);
  });

  it('automatically provisions a standard account for a verified Access email', async () => {
    const db = memoryDb();
    await expect(hasActiveAccessAccount(db, 'New.Member+Kairo@gmail.com', 'subject-1')).resolves.toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      email: 'new.member+kairo@gmail.com',
      accessEmail: 'new.member+kairo@gmail.com', accessSubject: 'subject-1',
      accountStatus: 'active',
      role: 'user',
    });
    expect(db.statements.some(sql => sql.includes('INSERT OR IGNORE INTO user_profiles'))).toBe(true);
  });

  it('links a legacy profile by its email without replacing its account data', async () => {
    const db = memoryDb([{
      id: 'legacy-account', email: 'legacy@gmail.com', accessEmail: null, accessSubject: null,
      accountStatus: 'active', role: 'user',
    }]);
    await expect(hasActiveAccessAccount(db, 'LEGACY@gmail.com', 'subject-1')).resolves.toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].id).toBe('legacy-account');
    expect(db.rows[0].accessEmail).toBe('legacy@gmail.com');
    expect(db.rows[0].accessSubject).toBe('subject-1');
  });

  it('does not bypass a suspended legacy profile or provisioning failure', async () => {
    const suspended = memoryDb([{
      id: 'legacy-account', email: 'legacy@gmail.com', accessEmail: null,
      accountStatus: 'suspended', role: 'user',
    }]);
    await expect(hasActiveAccessAccount(suspended, 'legacy@gmail.com', 'subject-1')).resolves.toBe(false);

    const full = memoryDb([], true);
    await expect(hasActiveAccessAccount(full, 'new.member@gmail.com', 'subject-1')).resolves.toBe(false);
  });
});
