import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetAccessJwksCacheForTests } from './auth/cloudflareAccess';
import app from './index';

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

async function signedAccessAssertion(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const kid = 'middleware-test-key';
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, use: 'sig', alg: 'RS256' };
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    aud: ['kairo-test-aud'],
    email: 'new.member@example.test',
    exp: now + 300,
    iat: now,
    nbf: now,
    iss: 'https://kairo-team.cloudflareaccess.com',
    type: 'app',
    sub: 'middleware-test-subject',
  }));
  const input = header + '.' + claims;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })));
  return input + '.' + base64url(new Uint8Array(signature));
}

const worker = app as unknown as {
  request(input: string, init?: RequestInit, env?: unknown): Promise<Response>;
};

describe('API origin protection', () => {
  const url = 'https://kairo.test/api/__origin_guard_test';
  const env = { ACCESS_ENFORCED: 'false' };

  it('rejects state-changing requests with no Origin or Referer', async () => {
    const response = await worker.request(url, { method: 'POST' }, env);
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('ORIGIN_FORBIDDEN');
  });

  it('rejects a foreign Origin even when the request is otherwise valid', async () => {
    const response = await worker.request(url, {
      method: 'PATCH',
      headers: { Origin: 'https://attacker.example' },
    }, env);
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('ORIGIN_FORBIDDEN');
  });

  it('allows a matching Origin or same-origin Referer', async () => {
    const originResponse = await worker.request(url, {
      method: 'POST',
      headers: { Origin: 'https://kairo.test' },
    }, env);
    const refererResponse = await worker.request(url, {
      method: 'DELETE',
      headers: { Referer: 'https://kairo.test/admin' },
    }, env);
    expect(originResponse.status).toBe(404);
    expect(refererResponse.status).toBe(404);
  });

  it('fails closed for protected API paths when Access is enforced but no assertion is present', async () => {
    const response = await worker.request('https://kairo.test/api/v1/me', { method: 'GET' }, {
      ACCESS_ENFORCED: 'true',
      ACCESS_TEAM_DOMAIN: 'kairo-team.cloudflareaccess.com',
      ACCESS_AUD: 'kairo-test-aud',
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('ACCESS_REQUIRED');
  });



  it('does not provision a new account on the first catalogue request', async () => {
    const assertion = await signedAccessAssertion();
    const statements: string[] = [];
    let writes = 0;
    const DB = {
      prepare(sql: string) {
        statements.push(sql);
        const statement = {
          bind: (..._values: unknown[]) => statement,
          first: async () => null,
          run: async () => {
            writes += 1;
            return { success: true, meta: { changes: 1 } };
          },
        };
        return statement;
      },
    } as unknown as D1Database;

    const response = await worker.request('https://kairo.test/api/v1/catalog/genres', {
      method: 'GET',
      headers: { 'Cf-Access-Jwt-Assertion': assertion },
    }, {
      ACCESS_ENFORCED: 'true',
      ACCESS_TEAM_DOMAIN: 'kairo-team.cloudflareaccess.com',
      ACCESS_AUD: 'kairo-test-aud',
      DB,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'ACCESS_ACCOUNT_DISABLED' },
    });
    expect(writes).toBe(0);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('WHERE access_email = ?');
  });

  it('revokes the server-side Kairo session and clears its cookie before Access sign-out', async () => {
    const writes: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind: (...values: unknown[]) => ({
            run: async () => {
              writes.push({ sql, values });
              return { success: true, meta: { changes: 1 } };
            },
          }),
        };
      },
    } as unknown as D1Database;
    const response = await worker.request('https://kairo.test/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Origin: 'https://kairo.test',
        Cookie: `kairo_session=${'a'.repeat(43)}`,
      },
    }, {
      ACCESS_ENFORCED: 'false',
      DB: db,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { signedOut: true } });
    expect(response.headers.get('Set-Cookie')).toContain('kairo_session=;');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toBe('DELETE FROM sessions WHERE token_hash = ?');
    expect(writes[0].values[0]).toMatch(/^[a-f0-9]{64}$/);
  });


  it('allows sign-out when Access is expired or the account is denied, but still enforces same-origin', async () => {
    const writes: Array<{ sql: string; values: unknown[] }> = [];
    const DB = {
      prepare(sql: string) {
        return {
          bind: (...values: unknown[]) => ({
            run: async () => {
              writes.push({ sql, values });
              return { success: true, meta: { changes: 1 } };
            },
          }),
        };
      },
    } as unknown as D1Database;
    const cookie = `kairo_session=${'b'.repeat(43)}`;
    const response = await worker.request('https://kairo.test/api/v1/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://kairo.test', Cookie: cookie },
    }, {
      ACCESS_ENFORCED: 'true',
      ACCESS_TEAM_DOMAIN: 'kairo-team.cloudflareaccess.com',
      ACCESS_AUD: 'kairo-test-aud',
      DB,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { signedOut: true } });
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toBe('DELETE FROM sessions WHERE token_hash = ?');

    writes.length = 0;
    const crossOrigin = await worker.request('https://kairo.test/api/v1/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://attacker.test', Cookie: cookie },
    }, {
      ACCESS_ENFORCED: 'true',
      ACCESS_TEAM_DOMAIN: 'kairo-team.cloudflareaccess.com',
      ACCESS_AUD: 'kairo-test-aud',
      DB,
    });
    expect(crossOrigin.status).toBe(403);
    expect(await crossOrigin.json()).toMatchObject({ error: { code: 'ORIGIN_FORBIDDEN' } });
    expect(writes).toHaveLength(0);
  });

  it('returns a real static asset from the ASSETS binding on a file-like route miss', async () => {
    const assetResponse = new Response('body { color: red; }', {
      status: 200,
      headers: { 'Content-Type': 'text/css; charset=utf-8' },
    });
    const fetch = vi.fn(async () => assetResponse);
    const response = await worker.request('https://kairo.test/assets/site.css', { method: 'GET' }, {
      ACCESS_ENFORCED: 'false',
      ASSETS: { fetch },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/css');
    expect(await response.text()).toBe('body { color: red; }');
    expect(fetch).toHaveBeenCalledTimes(1);
  });


  it('keeps the real index.html shell available when the Worker handles file-like paths', async () => {
    const shell = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
    const fetch = vi.fn(async () => new Response(shell, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));
    const response = await worker.request('https://kairo.test/index.html', { method: 'GET' }, {
      ACCESS_ENFORCED: 'false',
      ASSETS: { fetch },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(shell);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('converts an SPA index.html fallback into a real 404 for missing assets', async () => {
    const fetch = vi.fn(async () => new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));
    const response = await worker.request('https://kairo.test/assets/missing.js', { method: 'GET' }, {
      ACCESS_ENFORCED: 'false',
      ASSETS: { fetch },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'STATIC_ASSET_NOT_FOUND' },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not fetch assets for ordinary missing application routes', async () => {
    const fetch = vi.fn(async () => new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));
    const response = await worker.request('https://kairo.test/anime/not-in-router', { method: 'GET' }, {
      ACCESS_ENFORCED: 'false',
      ASSETS: { fetch },
    });
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps local unauthenticated /me requests explicitly in guest mode', async () => {
    const response = await worker.request('https://kairo.test/api/v1/me', { method: 'GET' }, {
      ACCESS_ENFORCED: 'false',
    });
    const payload = await response.json() as { success: boolean; error: { code: string } };
    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      success: false,
      error: { code: 'AUTH_REQUIRED' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps the public liveness probe minimal while Access is enforced', async () => {
    const response = await worker.request('https://kairo.test/api/health', { method: 'GET' }, {
      ACCESS_ENFORCED: 'true',
    });
    const payload = (await response.json()) as { success: boolean; data: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ status: 'ok', service: 'kairo-api' });
  });

  it('does not require Origin on safe read-only methods', async () => {
    const response = await worker.request(url, { method: 'GET' }, env);
    expect(response.status).toBe(404);
  });
});
