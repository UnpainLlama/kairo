import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetAccessJwksCacheForTests, verifyCloudflareAccessAssertion } from './cloudflareAccess';

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

async function signedAccessToken(options: { email?: string; audience?: string; expiresIn?: number; tamper?: boolean } = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'test-access-key', use: 'sig', alg: 'RS256' };
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'test-access-key', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    aud: [options.audience ?? 'kairo-test-aud'],
    email: options.email ?? 'Invited.User@Gmail.com',
    exp: now + (options.expiresIn ?? 300),
    iat: now,
    nbf: now,
    iss: 'https://kairo-team.cloudflareaccess.com',
    type: 'app',
    sub: 'cloudflare-identity-subject',
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

  it('rejects missing tokens and incomplete configuration without network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyCloudflareAccessAssertion(null, bindings)).resolves.toBeNull();
    await expect(verifyCloudflareAccessAssertion('token', { ACCESS_TEAM_DOMAIN: bindings.ACCESS_TEAM_DOMAIN })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
