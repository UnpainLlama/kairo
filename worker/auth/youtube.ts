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
  get?(name: string): unknown;
};
type OAuthTransaction = { user_id: string; session_hash: string; code_verifier: string; expires_at: number; consumed_at: number | null };
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const enc = new TextEncoder();

function requestId(c: YouTubeContext): string | undefined {
  const value = c.get?.('requestId');
  return typeof value === 'string' ? value : undefined;
}
function logYouTubeDiagnostic(c: YouTubeContext, event: string, details: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ event, ...(requestId(c) ? { requestId: requestId(c) } : {}), ...details }));
}
function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name.slice(0, 80) : 'unknown';
}
function safeGoogleErrorCode(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : 'unclassified';
}
function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown';
  return message.replace(/[\r\n\t]/g, ' ').slice(0, 180);
}
function encryptionKeyProblem(encoded: string | undefined): string | null {
  if (!encoded) return 'missing';
  if (encoded.length !== 43) return 'length_not_43';
  if (encoded.includes('=')) return 'padding_present';
  if (/[+/]/.test(encoded)) return 'standard_base64_alphabet';
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) return 'invalid_base64url_characters';
  try {
    if (decodeBase64Url(encoded).length !== 32) return 'decoded_length_not_32';
  } catch {
    return 'invalid_base64url_encoding';
  }
  return null;
}

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
function appBaseUrlProblem(c: YouTubeContext): string | null {
  const configured = c.env.APP_BASE_URL;
  if (!configured) return 'missing';
  try {
    const base = new URL(configured);
    if (!['https:', 'http:'].includes(base.protocol)) return 'unsupported_protocol';
    if (base.username || base.password) return 'credentials_not_allowed';
    if (base.pathname !== '/' || base.search || base.hash) return 'must_be_origin_only';
    if (base.protocol === 'http:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') return 'https_required';
    return null;
  } catch { return 'invalid_url'; }
}
function appBaseUrl(c: YouTubeContext): URL | null {
  if (appBaseUrlProblem(c)) return null;
  return new URL(c.env.APP_BASE_URL!);
}
function redirectTo(c: YouTubeContext, path: string): Response {
  const origin = appBaseUrl(c)?.origin ?? new URL(c.req.url).origin;
  return c.redirect(new URL(path, origin).toString(), 302);
}
function encryptionKey(encoded: string): Promise<CryptoKey> {
  const problem = encryptionKeyProblem(encoded);
  if (problem) throw new Error(`Invalid YouTube encryption key: ${problem}`);
  const bytes = decodeBase64Url(encoded);
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
  const base = appBaseUrl(c);
  return base ? new URL('/api/v1/auth/youtube/callback', base.origin).toString() : null;
}
function unavailable(c: YouTubeContext): Response {
  return c.json({ success: false, error: { code: 'YOUTUBE_CONNECT_UNAVAILABLE', message: 'YouTube connection is not configured yet.' }, meta: { requestId: requestId(c) } }, 503);
}

export function registerYouTubeAuthRoutes(app: any): void {
  app.get('/api/v1/auth/youtube', async (c: YouTubeContext) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
    const key = c.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
    const missingBindings = [
      ...(!clientId ? ['GOOGLE_CLIENT_ID'] : []),
      ...(!clientSecret ? ['GOOGLE_CLIENT_SECRET'] : []),
      ...(!key ? ['YOUTUBE_TOKEN_ENCRYPTION_KEY'] : []),
    ];
    if (missingBindings.length) {
      logYouTubeDiagnostic(c, 'youtube_configuration_unavailable', { reason: 'missing_bindings', missingBindings });
      return unavailable(c);
    }
    const keyProblem = encryptionKeyProblem(key);
    if (keyProblem) {
      logYouTubeDiagnostic(c, 'youtube_configuration_unavailable', { component: 'YOUTUBE_TOKEN_ENCRYPTION_KEY', reason: keyProblem });
      return unavailable(c);
    }
    try {
      await encryptionKey(key!);
    } catch (error) {
      logYouTubeDiagnostic(c, 'youtube_configuration_unavailable', { component: 'YOUTUBE_TOKEN_ENCRYPTION_KEY', reason: 'crypto_key_import_failed', errorName: safeErrorName(error) });
      return unavailable(c);
    }
    const cookie = c.req.header('Cookie') ?? null;
    const user = await findSessionUser(c.env.DB, cookie);
    if (!user) return redirectTo(c, '/login?youtube=sign_in_required&continue=youtube-connect');
    if (!await hasRecentSession(c.env.DB, cookie)) return redirectTo(c, '/login?youtube=reauth_required&continue=youtube-connect');

    const baseUrlProblem = appBaseUrlProblem(c);
    if (baseUrlProblem) {
      logYouTubeDiagnostic(c, 'youtube_configuration_unavailable', { component: 'APP_BASE_URL', reason: baseUrlProblem });
      return unavailable(c);
    }
    const callback = callbackUrl(c);
    if (!callback) {
      logYouTubeDiagnostic(c, 'youtube_configuration_unavailable', { component: 'APP_BASE_URL', reason: 'callback_url_construction_failed' });
      return unavailable(c);
    }
    const state = random(32);
    const verifier = random(48);
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
    const sessionToken = readSessionCookie(cookie);
    if (!sessionToken) return redirectTo(c, '/login?youtube=sign_in_required&continue=youtube-connect');
    const now = Date.now();
    try {
      await c.env.DB.prepare('DELETE FROM youtube_oauth_states WHERE expires_at < ? OR consumed_at IS NOT NULL').bind(now).run();
      await c.env.DB.prepare(
        'INSERT INTO youtube_oauth_states(state_hash,user_id,session_hash,code_verifier,expires_at) VALUES(?,?,?,?,?)'
      ).bind(await shaHex(state), user.id, await hashToken(sessionToken), verifier, now + 600000).run();
    } catch (error) {
      logYouTubeDiagnostic(c, 'youtube_oauth_state_store_failed', { errorName: safeErrorName(error), message: safeErrorMessage(error) });
      return c.json({ success: false, error: { code: 'YOUTUBE_CONNECT_UNAVAILABLE', message: 'Could not start YouTube connection. Please try again.' }, meta: { requestId: requestId(c) } }, 503);
    }
    c.header('Set-Cookie', stateCookie(state, new URL(callback).protocol === 'https:'));
    const target = new URL(AUTH_URL);
    target.search = new URLSearchParams({
      client_id: clientId!,
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
    const canonicalCallback = callbackUrl(c);
    const secure = canonicalCallback ? new URL(canonicalCallback).protocol === 'https:' : url.protocol === 'https:';
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code') ?? '';
    const browserState = cookieValue(c.req.header('Cookie'), 'kairo_youtube_state');
    c.header('Set-Cookie', clearStateCookie(secure), { append: true });
    if (!canonicalCallback) {
      logYouTubeDiagnostic(c, 'youtube_callback_configuration_unavailable', { component: 'APP_BASE_URL', reason: appBaseUrlProblem(c) ?? 'callback_url_construction_failed' });
      return unavailable(c);
    }
    if (url.searchParams.has('error')) {
      logYouTubeDiagnostic(c, 'youtube_google_authorization_denied', { googleError: safeGoogleErrorCode(url.searchParams.get('error')) });
      return redirectTo(c, '/settings?youtube=cancelled');
    }
    const stateFormatValid = /^[A-Za-z0-9_-]{40,64}$/.test(state);
    if (!state || browserState !== state || !stateFormatValid || !code || code.length > 2048) {
      logYouTubeDiagnostic(c, 'youtube_callback_invalid_response', {
        statePresent: Boolean(state),
        stateCookieMatched: Boolean(state && browserState === state),
        stateFormatValid,
        codePresent: Boolean(code),
        codeLengthValid: Boolean(code && code.length <= 2048),
      });
      return redirectTo(c, '/settings?youtube=invalid_response');
    }
    const cookie = c.req.header('Cookie') ?? null;
    const sessionToken = readSessionCookie(cookie);
    const user = await findSessionUser(c.env.DB, cookie);
    if (!sessionToken || !user) {
      logYouTubeDiagnostic(c, 'youtube_callback_session_missing');
      return redirectTo(c, '/login?youtube=sign_in_required&continue=youtube-connect');
    }

    let callbackStage = 'state_lookup';
    try {
      const stateHash = await shaHex(state);
      const transaction = await c.env.DB.prepare(
        'SELECT user_id,session_hash,code_verifier,expires_at,consumed_at FROM youtube_oauth_states WHERE state_hash=?'
      ).bind(stateHash).first<OAuthTransaction>();
      if (!transaction) {
        logYouTubeDiagnostic(c, 'youtube_callback_transaction_invalid', { reason: 'not_found' });
        return redirectTo(c, '/settings?youtube=expired');
      }
      const sessionHash = await hashToken(sessionToken);
      const transactionReason = transaction.user_id !== user.id ? 'user_mismatch'
        : transaction.session_hash !== sessionHash ? 'session_mismatch'
        : transaction.consumed_at !== null ? 'already_consumed'
        : transaction.expires_at <= Date.now() ? 'expired'
        : null;
      if (transactionReason) {
        logYouTubeDiagnostic(c, 'youtube_callback_transaction_invalid', { reason: transactionReason });
        return redirectTo(c, '/settings?youtube=expired');
      }
      callbackStage = 'state_consume';
      const consumed = await c.env.DB.prepare(
        'UPDATE youtube_oauth_states SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?'
      ).bind(Date.now(), stateHash, Date.now()).run();
      if (Number(consumed.meta?.changes ?? 0) !== 1) {
        logYouTubeDiagnostic(c, 'youtube_callback_transaction_consume_failed');
        return redirectTo(c, '/settings?youtube=expired');
      }

      const clientId = c.env.GOOGLE_CLIENT_ID;
      const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
      const key = c.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
      const missingBindings = [
        ...(!clientId ? ['GOOGLE_CLIENT_ID'] : []),
        ...(!clientSecret ? ['GOOGLE_CLIENT_SECRET'] : []),
        ...(!key ? ['YOUTUBE_TOKEN_ENCRYPTION_KEY'] : []),
      ];
      if (missingBindings.length) {
        logYouTubeDiagnostic(c, 'youtube_callback_configuration_unavailable', { reason: 'missing_bindings', missingBindings });
        return unavailable(c);
      }
      const keyProblem = encryptionKeyProblem(key);
      if (keyProblem) {
        logYouTubeDiagnostic(c, 'youtube_callback_configuration_unavailable', { component: 'YOUTUBE_TOKEN_ENCRYPTION_KEY', reason: keyProblem });
        return unavailable(c);
      }
      try {
        await encryptionKey(key!);
      } catch (error) {
        logYouTubeDiagnostic(c, 'youtube_callback_configuration_unavailable', { component: 'YOUTUBE_TOKEN_ENCRYPTION_KEY', reason: 'crypto_key_import_failed', errorName: safeErrorName(error) });
        return unavailable(c);
      }
      callbackStage = 'google_token_exchange';
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          code, client_id: clientId!, client_secret: clientSecret!,
          redirect_uri: canonicalCallback, grant_type: 'authorization_code',
          code_verifier: transaction.code_verifier,
        }),
      });
      if (!response.ok) {
        const upstream = await response.clone().json().catch(() => null) as { error?: unknown } | null;
        logYouTubeDiagnostic(c, 'youtube_google_token_exchange_failed', {
          httpStatus: response.status,
          googleError: safeGoogleErrorCode(upstream?.error),
        });
        return redirectTo(c, '/settings?youtube=token_exchange_failed');
      }
      callbackStage = 'google_token_response_validation';
      const tokens = await response.json() as {
        access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string;
      };
      const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [];
      const tokenIssues = [
        ...(!tokens.access_token ? ['access_token_missing'] : []),
        ...(tokens.access_token && tokens.access_token.length > 8192 ? ['access_token_too_long'] : []),
        ...(tokens.token_type?.toLowerCase() !== 'bearer' ? ['token_type_not_bearer'] : []),
        ...(scopes.length !== 1 || scopes[0] !== SCOPE ? ['required_scope_mismatch'] : []),
        ...(!Number.isFinite(Number(tokens.expires_in)) || Number(tokens.expires_in) <= 0 || Number(tokens.expires_in) > 86400 ? ['invalid_expiry'] : []),
      ];
      if (tokenIssues.length) {
        logYouTubeDiagnostic(c, 'youtube_google_token_response_invalid', { reasons: tokenIssues, receivedScopeCount: scopes.length, refreshTokenPresent: Boolean(tokens.refresh_token) });
        return redirectTo(c, '/settings?youtube=invalid_grant');
      }
      callbackStage = 'existing_connection_lookup';
      const existing = await c.env.DB.prepare(
        "SELECT encrypted_refresh_token FROM provider_connections WHERE user_id=? AND provider='youtube'"
      ).bind(user.id).first<{ encrypted_refresh_token: string | null }>();
      if (tokens.refresh_token && (tokens.refresh_token.length === 0 || tokens.refresh_token.length > 8192)) {
        logYouTubeDiagnostic(c, 'youtube_google_token_response_invalid', { reasons: ['refresh_token_length_invalid'] });
        return redirectTo(c, '/settings?youtube=invalid_grant');
      }
      callbackStage = 'refresh_token_encryption';
      const encryptedRefresh = tokens.refresh_token
        ? await encryptToken(tokens.refresh_token, key!)
        : existing?.encrypted_refresh_token;
      if (!encryptedRefresh) {
        logYouTubeDiagnostic(c, 'youtube_refresh_token_missing', { newRefreshTokenPresent: false, existingRefreshTokenPresent: Boolean(existing?.encrypted_refresh_token) });
        return redirectTo(c, '/settings?youtube=refresh_token_missing');
      }

      callbackStage = 'access_token_encryption';
      const encryptedAccess = await encryptToken(tokens.access_token!, key!);
      callbackStage = 'connection_persist';
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
    } catch (error) {
      // Log only the failing stage and exception class; never log codes, tokens, cookies, or payloads.
      logYouTubeDiagnostic(c, 'youtube_callback_failed', { stage: callbackStage, errorName: safeErrorName(error) });
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

  // On-demand subscriptions feed. Uses only the official YouTube Data API and
  // keeps provider credentials server-side; feed items are not persisted.
  app.get('/api/v1/youtube/subscriptions/feed', async (c: any) => {
    c.header('Cache-Control', 'no-store');
    const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
    if (!user) return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to view your YouTube subscriptions.' } }, 401);

    const key = c.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
    if (!key || !c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
      return c.json({ success: false, error: { code: 'YOUTUBE_UNAVAILABLE', message: 'YouTube is not configured for this environment.' } }, 503);
    }

    try {
      const connection = await c.env.DB.prepare(
        "SELECT encrypted_access_token, encrypted_refresh_token, token_expires_at FROM provider_connections WHERE user_id=? AND provider='youtube' LIMIT 1"
      ).bind(user.id).first<{ encrypted_access_token: string | null; encrypted_refresh_token: string | null; token_expires_at: number | null }>();
      if (!connection?.encrypted_refresh_token) {
        return c.json({ success: false, error: { code: 'YOUTUBE_NOT_CONNECTED', message: 'Connect YouTube in Settings to view your subscriptions.' } }, 403);
      }

      let accessToken = connection.encrypted_access_token
        ? await decryptToken(connection.encrypted_access_token, key)
        : '';
      if (!accessToken || !connection.token_expires_at || connection.token_expires_at <= Date.now() + 60000) {
        const refreshResponse = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({
            client_id: c.env.GOOGLE_CLIENT_ID,
            client_secret: c.env.GOOGLE_CLIENT_SECRET,
            refresh_token: await decryptToken(connection.encrypted_refresh_token, key),
            grant_type: 'refresh_token',
          }),
        });
        const refreshed = await refreshResponse.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
        if (!refreshResponse.ok || !refreshed.access_token || !Number.isFinite(Number(refreshed.expires_in)) || Number(refreshed.expires_in) <= 0) {
          if (refreshed.error === 'invalid_grant') {
            return c.json({ success: false, error: { code: 'YOUTUBE_REAUTH_REQUIRED', message: 'Your YouTube access has expired. Reconnect YouTube in Settings.' } }, 401);
          }
          logYouTubeDiagnostic(c, 'youtube_token_refresh_failed', { httpStatus: refreshResponse.status, googleError: safeGoogleErrorCode(refreshed.error) });
          return c.json({ success: false, error: { code: 'YOUTUBE_PROVIDER_UNAVAILABLE', message: 'Could not refresh YouTube access. Please try again.' } }, 503);
        }
        accessToken = refreshed.access_token;
        const encryptedAccess = await encryptToken(accessToken, key);
        await c.env.DB.prepare(
          "UPDATE provider_connections SET encrypted_access_token=?, token_expires_at=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND provider='youtube'"
        ).bind(encryptedAccess, Date.now() + Number(refreshed.expires_in) * 1000, user.id).run();
      }

      const apiGet = async (resource: string, params: Record<string, string>) => {
        const url = new URL('https://www.googleapis.com/youtube/v3/' + resource);
        for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
        const response = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({})) as any;
        if (!response.ok) {
          const reason = payload?.error?.errors?.[0]?.reason;
          if (response.status === 401) throw new Error('YOUTUBE_REAUTH_REQUIRED');
          if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YOUTUBE_QUOTA_EXCEEDED');
          throw new Error('YOUTUBE_API_REQUEST_FAILED');
        }
        return payload;
      };

      const requestedToken = c.req.query('pageToken') ?? '';
      if (requestedToken.length > 1024 || /[\\u0000-\\u001F\\u007F]/.test(requestedToken)) {
        return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The feed page token is invalid.' } }, 400);
      }
      const subscriptions = await apiGet('subscriptions', {
        part: 'snippet', mine: 'true', maxResults: '12',
        ...(requestedToken ? { pageToken: requestedToken } : {}),
      });
      const subscribedChannels = (subscriptions.items ?? []).map((item: any) => ({
        id: item?.snippet?.resourceId?.channelId,
        title: item?.snippet?.title,
      })).filter((item: any) => typeof item.id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(item.id));
      if (!subscribedChannels.length) {
        return c.json({ success: true, data: { videos: [], nextPageToken: subscriptions.nextPageToken ?? null, channelsChecked: 0 } });
      }

      const channelData = await apiGet('channels', {
        part: 'contentDetails', id: subscribedChannels.map((item: any) => item.id).join(','),
        maxResults: String(subscribedChannels.length),
      });
      const uploads = (channelData.items ?? []).map((channel: any) => ({
        id: channel.id,
        playlistId: channel?.contentDetails?.relatedPlaylists?.uploads,
      })).filter((item: any) => typeof item.id === 'string' && typeof item.playlistId === 'string');

      const batches = await Promise.all(uploads.map(async (channel: any) => {
        const result = await apiGet('playlistItems', {
          part: 'snippet,contentDetails', playlistId: channel.playlistId, maxResults: '4',
        });
        return (result.items ?? []).map((item: any) => {
          const snippet = item?.snippet ?? {};
          const videoId = snippet?.resourceId?.videoId;
          if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
          const thumbnails = snippet.thumbnails ?? {};
          const thumbnail = thumbnails.maxres?.url ?? thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? null;
          const publishedAt = item?.contentDetails?.videoPublishedAt ?? snippet.publishedAt ?? null;
          return {
            videoId, title: typeof snippet.title === 'string' ? snippet.title : 'Untitled video',
            description: typeof snippet.description === 'string' ? snippet.description : '',
            thumbnail: typeof thumbnail === 'string' ? thumbnail : null,
            channelId: channel.id,
            channelTitle: typeof snippet.channelTitle === 'string' ? snippet.channelTitle : '',
            publishedAt: typeof publishedAt === 'string' ? publishedAt : null,
            url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId),
          };
        }).filter(Boolean);
      }));
      const videos = batches.flat().sort((a: any, b: any) =>
        Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '')
      ).slice(0, 24);
      return c.json({
        success: true,
        data: { videos, nextPageToken: subscriptions.nextPageToken ?? null, channelsChecked: uploads.length },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'YOUTUBE_REAUTH_REQUIRED') {
        return c.json({ success: false, error: { code: 'YOUTUBE_REAUTH_REQUIRED', message: 'Reconnect YouTube in Settings to continue.' } }, 401);
      }
      if (error instanceof Error && error.message === 'YOUTUBE_QUOTA_EXCEEDED') {
        return c.json({ success: false, error: { code: 'YOUTUBE_QUOTA_EXCEEDED', message: 'YouTube API quota has been reached. Please try again later.' } }, 503);
      }
      logYouTubeDiagnostic(c, 'youtube_subscriptions_feed_failed', { errorName: safeErrorName(error) });
      return c.json({ success: false, error: { code: 'YOUTUBE_PROVIDER_UNAVAILABLE', message: 'Could not load your YouTube subscriptions right now.' } }, 503);
    }
  });

}
