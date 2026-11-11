import { findSessionUser, hasRecentSession, hashToken, readSessionCookie } from './session';

type YouTubeBindings = {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;
  APP_BASE_URL?: string;
};
type YouTubeContext = {
  env: YouTubeBindings;
  req: { url: string; header(name: string): string | undefined };
  redirect(url: string, status?: number): Response;
  header(name: string, value: string, options?: { append?: boolean }): void;
  json(body: unknown, status?: number): Response;
};
type OAuthTransaction = { user_id: string; session_hash: string; code_verifier: string; expires_at: number; consumed_at: number | null };
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
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
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
}
async function shaHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function cookieValue(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator >= 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim() || null;
  }
  return null;
}
function stateCookie(state: string, secure: boolean): string {
  return `kairo_youtube_state=${state}; Path=/api/v1/auth/youtube/callback; Max-Age=600; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
function clearStateCookie(secure: boolean): string {
  return `kairo_youtube_state=; Path=/api/v1/auth/youtube/callback; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
function redirectTo(c: YouTubeContext, path: string): Response {
  return c.redirect(new URL(path, new URL(c.req.url).origin).toString(), 302);
}
function encryptionKey(encoded: string): Promise<CryptoKey> {
  const bytes = decodeBase64Url(encoded);
  if (bytes.length !== 32) throw new Error('YOUTUBE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptToken(token: string, encodedKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(encodedKey), enc.encode(token));
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}
async function decryptToken(value: string, encodedKey: string): Promise<string> {
  const [version, iv, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext) throw new Error('Unsupported encrypted token format');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(iv) },
    await encryptionKey(encodedKey),
    decodeBase64Url(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
function callbackUrl(c: YouTubeContext): string | null {
  const configured = c.env.APP_BASE_URL;
  if (!configured) return null;
  try {
    const base = new URL(configured);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) return null;
    if (base.protocol === 'http:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') return null;
    return new URL('/api/v1/auth/youtube/callback', base.origin).toString();
  } catch { return null; }
}
function unavailable(c: YouTubeContext): Response {
  return c.json({ success: false, error: { code: 'YOUTUBE_CONNECT_UNAVAILABLE', message: 'YouTube connection is not configured yet.' } }, 503);
}

export function registerYouTubeAuthRoutes(app: any): void {
  app.get('/api/v1/auth/youtube', async (c: YouTubeContext) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
    const key = c.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
    if (!clientId || !clientSecret || !key) return unavailable(c);
    try { await encryptionKey(key); } catch { return unavailable(c); }
    const cookie = c.req.header('Cookie') ?? null;
    const user = await findSessionUser(c.env.DB, cookie);
    if (!user) return redirectTo(c, '/login?youtube=sign_in_required');
    if (!await hasRecentSession(c.env.DB, cookie)) return redirectTo(c, '/login?youtube=reauth_required');

    const state = random(32);
    const verifier = random(48);
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
    const sessionToken = readSessionCookie(cookie);
    if (!sessionToken) return redirectTo(c, '/login?youtube=sign_in_required');
    const now = Date.now();
    try {
      await c.env.DB.prepare('DELETE FROM youtube_oauth_states WHERE expires_at < ? OR consumed_at IS NOT NULL').bind(now).run();
      await c.env.DB.prepare(
        'INSERT INTO youtube_oauth_states(state_hash,user_id,session_hash,code_verifier,expires_at) VALUES(?,?,?,?,?)'
      ).bind(await shaHex(state), user.id, await hashToken(sessionToken), verifier, now + 600000).run();
    } catch {
      return c.json({ success: false, error: { code: 'YOUTUBE_CONNECT_UNAVAILABLE', message: 'Could not start YouTube connection. Please try again.' } }, 503);
    }
    const url = new URL(c.req.url);
    const callback = callbackUrl(c);
    if (!callback) return unavailable(c);
    c.header('Set-Cookie', stateCookie(state, url.protocol === 'https:'));
    const target = new URL(AUTH_URL);
    target.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'false',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return c.redirect(target.toString(), 302);
  });

  app.get('/api/v1/auth/youtube/callback', async (c: YouTubeContext) => {
    const url = new URL(c.req.url);
    const secure = url.protocol === 'https:';
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code') ?? '';
    const browserState = cookieValue(c.req.header('Cookie'), 'kairo_youtube_state');
    c.header('Set-Cookie', clearStateCookie(secure), { append: true });
    if (url.searchParams.has('error')) return redirectTo(c, '/settings?youtube=cancelled');
    if (!state || browserState !== state || !/^[A-Za-z0-9_-]{40,64}$/.test(state) || !code || code.length > 2048) {
      return redirectTo(c, '/settings?youtube=invalid_response');
    }
    const cookie = c.req.header('Cookie') ?? null;
    const sessionToken = readSessionCookie(cookie);
    const user = await findSessionUser(c.env.DB, cookie);
    if (!sessionToken || !user) return redirectTo(c, '/login?youtube=sign_in_required');

    try {
      const stateHash = await shaHex(state);
      const transaction = await c.env.DB.prepare(
        'SELECT user_id,session_hash,code_verifier,expires_at,consumed_at FROM youtube_oauth_states WHERE state_hash=?'
      ).bind(stateHash).first<OAuthTransaction>();
      if (!transaction || transaction.user_id !== user.id || transaction.session_hash !== await hashToken(sessionToken) ||
          transaction.consumed_at !== null || transaction.expires_at <= Date.now()) {
        return redirectTo(c, '/settings?youtube=expired');
      }
      const consumed = await c.env.DB.prepare(
        'UPDATE youtube_oauth_states SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?'
      ).bind(Date.now(), stateHash, Date.now()).run();
      if (Number(consumed.meta?.changes ?? 0) !== 1) return redirectTo(c, '/settings?youtube=expired');

      const clientId = c.env.GOOGLE_CLIENT_ID;
      const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
      const key = c.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
      if (!clientId || !clientSecret || !key) return unavailable(c);
      const callback = callbackUrl(c);
      if (!callback) return unavailable(c);
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          code, client_id: clientId, client_secret: clientSecret,
          redirect_uri: callback, grant_type: 'authorization_code',
          code_verifier: transaction.code_verifier,
        }),
      });
      if (!response.ok) return redirectTo(c, '/settings?youtube=token_exchange_failed');
      const tokens = await response.json() as {
        access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string;
      };
      const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [];
      if (!tokens.access_token || tokens.access_token.length > 8192 || tokens.token_type?.toLowerCase() !== 'bearer' ||
          scopes.length !== 1 || scopes[0] !== SCOPE || !Number.isFinite(Number(tokens.expires_in)) || Number(tokens.expires_in) <= 0 || Number(tokens.expires_in) > 86400) {
        return redirectTo(c, '/settings?youtube=invalid_grant');
      }
      const existing = await c.env.DB.prepare(
        "SELECT encrypted_refresh_token FROM provider_connections WHERE user_id=? AND provider='youtube'"
      ).bind(user.id).first<{ encrypted_refresh_token: string | null }>();
      if (tokens.refresh_token && (tokens.refresh_token.length === 0 || tokens.refresh_token.length > 8192)) {
        return redirectTo(c, '/settings?youtube=invalid_grant');
      }
      const encryptedRefresh = tokens.refresh_token
        ? await encryptToken(tokens.refresh_token, key)
        : existing?.encrypted_refresh_token;
      if (!encryptedRefresh) return redirectTo(c, '/settings?youtube=refresh_token_missing');

      const encryptedAccess = await encryptToken(tokens.access_token, key);
      await c.env.DB.prepare(`
        INSERT INTO provider_connections
          (id,user_id,provider,provider_subject,encrypted_access_token,encrypted_refresh_token,token_expires_at,scopes_json)
        VALUES (?,?,'youtube',NULL,?,?,?,?)
        ON CONFLICT(user_id,provider) DO UPDATE SET
          encrypted_access_token=excluded.encrypted_access_token,
          encrypted_refresh_token=excluded.encrypted_refresh_token,
          token_expires_at=excluded.token_expires_at,
          scopes_json=excluded.scopes_json,
          updated_at=CURRENT_TIMESTAMP
      `).bind(crypto.randomUUID(), user.id, encryptedAccess, encryptedRefresh, Date.now() + Number(tokens.expires_in) * 1000, JSON.stringify(scopes)).run();
      return redirectTo(c, '/settings?youtube=connected');
    } catch {
      // OAuth tokens and upstream payloads are deliberately excluded from logs.
      return redirectTo(c, '/settings?youtube=failed');
    }
  });

  app.get('/api/v1/auth/youtube/status', async (c: YouTubeContext) => {
    const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
    if (!user) return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to manage YouTube.' } }, 401);
    try {
      const row = await c.env.DB.prepare(
        "SELECT connected_at,updated_at,scopes_json FROM provider_connections WHERE user_id=? AND provider='youtube' LIMIT 1"
      ).bind(user.id).first<{ connected_at: string; updated_at: string; scopes_json: string }>();
      let scopes: string[] = [];
      try { const parsed = JSON.parse(row?.scopes_json ?? '[]'); if (Array.isArray(parsed)) scopes = parsed.filter((x): x is string => typeof x === 'string'); } catch { /* invalid legacy metadata */ }
      return c.json({ success: true, data: { connected: Boolean(row), connectedAt: row?.connected_at ?? null, updatedAt: row?.updated_at ?? null, scopes } });
    } catch {
      return c.json({ success: false, error: { code: 'YOUTUBE_STATUS_UNAVAILABLE', message: 'Could not load YouTube connection status.' } }, 503);
    }
  });

  app.post('/api/v1/auth/youtube/disconnect', async (c: YouTubeContext) => {
    const origin = c.req.header('Origin');
    if (!origin || origin !== new URL(c.req.url).origin) {
      return c.json({ success: false, error: { code: 'ORIGIN_FORBIDDEN', message: 'This request origin is not allowed.' } }, 403);
    }
    const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
    if (!user) return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to manage YouTube.' } }, 401);
    try {
      const row = await c.env.DB.prepare(
        "SELECT encrypted_refresh_token FROM provider_connections WHERE user_id=? AND provider='youtube' LIMIT 1"
      ).bind(user.id).first<{ encrypted_refresh_token: string | null }>();
      if (row?.encrypted_refresh_token && c.env.YOUTUBE_TOKEN_ENCRYPTION_KEY) {
        try {
          const token = await decryptToken(row.encrypted_refresh_token, c.env.YOUTUBE_TOKEN_ENCRYPTION_KEY);
          await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
        } catch { /* Local credential removal must succeed even if Google's revoke endpoint is unavailable. */ }
      }
      await c.env.DB.prepare("DELETE FROM provider_connections WHERE user_id=? AND provider='youtube'").bind(user.id).run();
      return c.json({ success: true, data: { disconnected: true } });
    } catch {
      return c.json({ success: false, error: { code: 'YOUTUBE_DISCONNECT_FAILED', message: 'Could not disconnect YouTube. Please try again.' } }, 503);
    }
  });
}
