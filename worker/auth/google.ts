import { createOpaqueToken, createSession, findSessionUser, hasRecentSession, hashToken, sessionCookie } from './session';

type GoogleBindings = { DB: D1Database; APP_BASE_URL?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string };
type GoogleContext = {
  env: GoogleBindings;
  req: { url: string; header(name: string): string | undefined };
  redirect(url: string, status?: number): Response;
  header(name: string, value: string, options?: { append?: boolean }): void;
  json(body: unknown, status?: number): Response;
};
type GoogleClaims = {
  iss: string; aud: string | string[]; azp?: string; sub: string; exp: number; iat: number;
  nonce: string; email: string; email_verified: boolean; name?: string;
};
type OAuthState = { nonce: string; code_verifier: string; link_user_id: string | null; expires_at: number; consumed_at: number | null };
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const enc = new TextEncoder();
function random(size = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64Url(bytes: Uint8Array): string {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}
async function shaHex(value: string): Promise<string> {
  return [...await sha256(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function decodeJsonPart(value: string): any {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)));
}
type GoogleJwk = JsonWebKey & { kid?: string };
let jwksCache: { keys: GoogleJwk[]; expiresAt: number } | null = null;
async function googleKeys(): Promise<GoogleJwk[]> {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const response = await fetch(GOOGLE_JWKS, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Google signing keys unavailable');
  const data = await response.json() as { keys?: GoogleJwk[] };
  if (!Array.isArray(data.keys)) throw new Error('Invalid Google signing keys');
  jwksCache = { keys: data.keys, expiresAt: Date.now() + 3600000 };
  return data.keys;
}
async function validateIdToken(token: string, clientId: string, expectedNonce: string): Promise<GoogleClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');
  const header = decodeJsonPart(parts[0]) as { alg?: string; kid?: string };
  const claims = decodeJsonPart(parts[1]) as GoogleClaims;
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported ID token algorithm');
  const jwk = (await googleKeys()).find(key => key.kid === header.kid);
  if (!jwk) { jwksCache = null; throw new Error('Google signing key not found'); }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const normalized = parts[2].replace(/-/g, '+').replace(/_/g, '/');
  const signature = Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), char => char.charCodeAt(0));
  const validSignature = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, enc.encode(parts[0] + '.' + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!validSignature ||
    !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
    !audiences.includes(clientId) || (audiences.length > 1 && claims.azp !== clientId) || (Boolean(claims.azp) && claims.azp !== clientId) ||
    typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
    !Number.isFinite(claims.exp) || claims.exp <= now - 30 ||
    !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
    claims.nonce !== expectedNonce || claims.email_verified !== true ||
    typeof claims.email !== 'string' || claims.email.length > 254) {
    throw new Error('Google ID token validation failed');
  }
  return claims;
}
function displayName(claims: GoogleClaims): string {
  const name = (claims.name?.trim() || claims.email.split('@')[0] || 'Kairo user').slice(0, 40);
  return name.length >= 2 ? name : name.padEnd(2, '_');
}
function stateCookie(state: string, secure: boolean): string { return `kairo_oauth_state=${state}; Path=/api/v1/auth/google/callback; Max-Age=600; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`; }
function clearStateCookie(secure: boolean): string { return `kairo_oauth_state=; Path=/api/v1/auth/google/callback; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`; }
function cookieState(header: string | undefined): string | null { for (const part of (header ?? '').split(';')) { const [name, ...value] = part.trim().split('='); if (name === 'kairo_oauth_state') return value.join('=') || null; } return null; }
function appBaseUrl(c: GoogleContext): URL | null {
  if (!c.env.APP_BASE_URL) return null;
  try {
    const base = new URL(c.env.APP_BASE_URL);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) return null;
    if (base.protocol === 'http:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') return null;
    return base;
  } catch { return null; }
}
function callbackUrl(c: GoogleContext): string | null {
  const base = appBaseUrl(c);
  return base ? new URL('/api/v1/auth/google/callback', base.origin).toString() : null;
}
function redirectTo(c: GoogleContext, path: string): Response {
  const origin = appBaseUrl(c)?.origin ?? new URL(c.req.url).origin;
  return c.redirect(new URL(path, origin).toString(), 302);
}
function unavailable(c: GoogleContext): Response {
  return c.json({ success: false, error: { code: 'GOOGLE_AUTH_UNAVAILABLE', message: 'Google sign-in is not configured yet.' } }, 503);
}

export function registerGoogleAuthRoutes(app: any): void {
  app.get('/api/v1/auth/google', async (c: GoogleContext) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return unavailable(c);
    const callback = callbackUrl(c);
    if (!callback) return unavailable(c);
    const url = new URL(c.req.url);
    const intent = url.searchParams.get('intent');
    if (intent !== null && intent !== 'link') return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid Google sign-in intent.' } }, 400);
    let linkUserId: string | null = null;
    if (intent === 'link') {
      const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
      if (!user) return redirectTo(c, '/login?google=sign_in_required');
      if (!await hasRecentSession(c.env.DB, c.req.header('Cookie') ?? null)) return redirectTo(c, '/login?google=reauth_required');
      linkUserId = user.id;
    }
    const state = random(32), nonce = random(32), verifier = random(48);
    const challenge = base64Url(await sha256(verifier));
    try {
      const now = Date.now();
      await c.env.DB.prepare('DELETE FROM google_oauth_states WHERE expires_at < ? OR consumed_at IS NOT NULL').bind(now).run();
      await c.env.DB.prepare('INSERT INTO google_oauth_states(state_hash,nonce,code_verifier,link_user_id,expires_at) VALUES(?,?,?,?,?)')
        .bind(await shaHex(state), nonce, verifier, linkUserId, now + 600000).run();
    } catch {
      return c.json({ success: false, error: { code: 'GOOGLE_AUTH_UNAVAILABLE', message: 'Could not start Google sign-in. Please try again.' } }, 503);
    }
    c.header('Set-Cookie', stateCookie(state, new URL(callback).protocol === 'https:'));
    const target = new URL(GOOGLE_AUTH);
    target.search = new URLSearchParams({
      client_id: clientId, redirect_uri: callback, response_type: 'code',
      scope: 'openid email profile', state, nonce, code_challenge: challenge,
      code_challenge_method: 'S256', prompt: 'select_account'
    }).toString();
    return c.redirect(target.toString(), 302);
  });

  app.get('/api/v1/auth/google/callback', async (c: GoogleContext) => {
    const url = new URL(c.req.url);
    const callback = callbackUrl(c);
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code') ?? '';
    const secure = callback ? new URL(callback).protocol === 'https:' : url.protocol === 'https:';
    const browserState = cookieState(c.req.header('Cookie'));
    c.header('Set-Cookie', clearStateCookie(secure), { append: true });
    if (!callback) return unavailable(c);
    if (!state || browserState !== state) return redirectTo(c, '/login?google=invalid_response');
    if (url.searchParams.has('error')) return redirectTo(c, '/login?google=cancelled');
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(state) || !code || code.length > 2048) return redirectTo(c, '/login?google=invalid_response');
    try {
      const stateHash = await shaHex(state);
      const transaction = await c.env.DB.prepare(
        'SELECT nonce,code_verifier,link_user_id,expires_at,consumed_at FROM google_oauth_states WHERE state_hash=?'
      ).bind(stateHash).first<OAuthState>();
      if (!transaction || transaction.consumed_at !== null || transaction.expires_at <= Date.now()) return redirectTo(c, '/login?google=expired');
      const consumed = await c.env.DB.prepare(
        'UPDATE google_oauth_states SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?'
      ).bind(Date.now(), stateHash, Date.now()).run();
      if (Number(consumed.meta?.changes ?? 0) !== 1) return redirectTo(c, '/login?google=expired');
      const clientId = c.env.GOOGLE_CLIENT_ID;
      const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return unavailable(c);
      const tokenResponse = await fetch(GOOGLE_TOKEN, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          code, client_id: clientId, client_secret: clientSecret,
          redirect_uri: callback, grant_type: 'authorization_code', code_verifier: transaction.code_verifier
        })
      });
      if (!tokenResponse.ok) return redirectTo(c, '/login?google=token_exchange_failed');
      const tokens = await tokenResponse.json() as { id_token?: string };
      if (!tokens.id_token) return redirectTo(c, '/login?google=missing_identity');
      const claims = await validateIdToken(tokens.id_token, clientId, transaction.nonce);
      const linkedIdentity = await c.env.DB.prepare(
        "SELECT i.user_id AS userId,p.account_status AS accountStatus FROM auth_identities i JOIN user_profiles p ON p.id=i.user_id WHERE i.provider='google' AND i.provider_subject=?"
      ).bind(claims.sub).first<{ userId: string; accountStatus: string }>();
      let userId: string;
      if (transaction.link_user_id) {
        const current = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
        if (!current || current.id !== transaction.link_user_id || !await hasRecentSession(c.env.DB, c.req.header('Cookie') ?? null)) return redirectTo(c, '/login?google=reauth_required');
        if (linkedIdentity && linkedIdentity.userId !== current.id) return redirectTo(c, '/settings?google=already_linked');
        const currentGoogleIdentity = await c.env.DB.prepare(
          "SELECT provider_subject FROM auth_identities WHERE provider='google' AND user_id=?"
        ).bind(current.id).first<{ provider_subject: string }>();
        if (currentGoogleIdentity && currentGoogleIdentity.provider_subject !== claims.sub) return redirectTo(c, '/settings?google=another_account_linked');
        if (!linkedIdentity) {
          await c.env.DB.prepare("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES(?,?,'google',?)")
            .bind(crypto.randomUUID(), current.id, claims.sub).run();
        }
        userId = current.id;
      } else if (linkedIdentity) {
        if (linkedIdentity.accountStatus !== 'active') return redirectTo(c, '/login?google=account_unavailable');
        userId = linkedIdentity.userId;
      } else {
        const emailOwner = await c.env.DB.prepare('SELECT id FROM user_profiles WHERE email=? COLLATE NOCASE LIMIT 1')
          .bind(claims.email.toLowerCase()).first<{ id: string }>();
        // Never silently merge a Google identity with an existing password account based on email alone.
        if (emailOwner) return redirectTo(c, '/login?google=link_required');
        userId = crypto.randomUUID();
        try {
          await c.env.DB.batch([
            c.env.DB.prepare("INSERT INTO user_profiles(id,identity_subject,display_name,email,email_verified_at,account_status,role) VALUES(?,?,?,?,CURRENT_TIMESTAMP,'active','user')")
              .bind(userId, 'google:' + claims.sub, displayName(claims), claims.email.toLowerCase()),
            c.env.DB.prepare("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES(?,?,'google',?)")
              .bind(crypto.randomUUID(), userId, claims.sub)
          ]);
        } catch {
          const raced = await c.env.DB.prepare("SELECT user_id FROM auth_identities WHERE provider='google' AND provider_subject=?")
            .bind(claims.sub).first<{ user_id: string }>();
          if (!raced) return redirectTo(c, '/login?google=link_required');
          userId = raced.user_id;
        }
      }
      const session = await createSession(c.env.DB, userId, { userAgent: c.req.header('User-Agent') ?? undefined });
      c.header('Set-Cookie', sessionCookie(session.token, url.protocol === 'https:'), { append: true });
      await c.env.DB.prepare("UPDATE auth_identities SET last_used_at=CURRENT_TIMESTAMP WHERE provider='google' AND provider_subject=?")
        .bind(claims.sub).run();
      return transaction.link_user_id ? redirectTo(c, '/settings?google=connected') : redirectTo(c, '/');
    } catch (error) {
      console.error(JSON.stringify({ event: 'google_auth_callback_failed', message: error instanceof Error ? error.message : 'unknown' }));
      return redirectTo(c, '/login?google=failed');
    }
  });
}
