import { findSessionUser, hasRecentSession, hashToken, readSessionCookie } from './session';

type YouTubeBindings = {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  YOUTUBE_TOKEN_ENCRYPTION_KEY?: string;
  YOUTUBE_DATA_API_KEY?: string;
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


const YOUTUBE_RATE_WINDOW_MS = 15 * 60 * 1000;
const YOUTUBE_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const YOUTUBE_SEARCH_DAILY_LIMIT = 80; // Reserve 20 of the default 100 search.list calls for operational headroom.
const YOUTUBE_DATA_DAILY_LIMIT = 8000; // Leave 2,000 units for other application usage.

async function bumpYouTubeRateBucket(
  c: YouTubeContext,
  bucket: string,
  limit: number,
  windowMs: number,
  cost = 1,
): Promise<boolean> {
  const bucketKey = await shaHex(`youtube:quota:${bucket}`);
  const now = Date.now();
  const row = await c.env.DB.prepare(`
    INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempts)
    VALUES (?, ?, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET
      attempts = CASE WHEN window_started_at <= ? THEN ? ELSE attempts + ? END,
      window_started_at = CASE WHEN window_started_at <= ? THEN ? ELSE window_started_at END
    RETURNING attempts
  `).bind(bucketKey, now, cost, now - windowMs, cost, cost, now - windowMs, now).first<{ attempts: number }>();
  return Number(row?.attempts ?? limit + 1) <= limit;
}

async function allowYouTubeRequest(
  c: YouTubeContext,
  userId: string,
  action: string,
  limit: number,
  budget?: { bucket: string; limit: number; windowMs: number; cost?: number },
): Promise<boolean> {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const userBucket = await shaHex(`youtube:user:${action}:${ip}:${userId}`);
  if (!await bumpYouTubeRateBucket(c, userBucket, limit, YOUTUBE_RATE_WINDOW_MS)) return false;
  return budget
    ? bumpYouTubeRateBucket(c, budget.bucket, budget.limit, budget.windowMs, budget.cost ?? 1)
    : true;
}

function youtubeApiKey(c: YouTubeContext): string {
  const key = c.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!key) throw new Error('YOUTUBE_API_KEY_MISSING');
  return key;
}

async function youtubeApiGet(apiKey: string, resource: string, params: Record<string, string>): Promise<any> {
  const url = new URL('https://www.googleapis.com/youtube/v3/' + resource);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  // The API key stays in this server-side request only. Never return or log the URL.
  url.searchParams.set('key', apiKey);
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    const reason = payload?.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('YOUTUBE_QUOTA_EXCEEDED');
    if (reason === 'keyInvalid' || reason === 'accessNotConfigured' || reason === 'ipRefererBlocked') throw new Error('YOUTUBE_API_KEY_INVALID');
    throw new Error('YOUTUBE_PROVIDER_UNAVAILABLE');
  }
  return payload;
}

function youtubeRouteError(c: YouTubeContext, event: string, error: unknown): Response {
  const code = error instanceof Error ? error.message : 'YOUTUBE_PROVIDER_UNAVAILABLE';
  const issues: Record<string, { status: number; message: string }> = {
    YOUTUBE_API_KEY_MISSING: { status: 503, message: 'Public YouTube data is not configured for this environment yet.' },
    YOUTUBE_API_KEY_INVALID: { status: 503, message: 'The public YouTube API key is not accepted. Check its API restrictions and Worker configuration.' },
    YOUTUBE_NOT_CONNECTED: { status: 403, message: 'Connect YouTube to search for channels and build your feed.' },
    YOUTUBE_REAUTH_REQUIRED: { status: 401, message: 'Your YouTube connection needs to be renewed. Reconnect YouTube in Settings.' },
    YOUTUBE_QUOTA_EXCEEDED: { status: 503, message: 'YouTube search is temporarily unavailable because its API quota has been reached.' },
    YOUTUBE_UNAVAILABLE: { status: 503, message: 'YouTube is not configured for this environment.' },
    YOUTUBE_PROVIDER_UNAVAILABLE: { status: 503, message: 'YouTube could not complete that request. Please try again.' },
  };
  const issue = issues[code] ?? issues.YOUTUBE_PROVIDER_UNAVAILABLE;
  if (code !== 'YOUTUBE_NOT_CONNECTED' && code !== 'YOUTUBE_REAUTH_REQUIRED' && code !== 'YOUTUBE_UNAVAILABLE') {
    logYouTubeDiagnostic(c, event, { errorName: safeErrorName(error), reason: code });
  }
  return c.json({ success: false, error: { code: issues[code] ? code : 'YOUTUBE_PROVIDER_UNAVAILABLE', message: issue.message }, meta: { requestId: requestId(c) } }, issue.status);
}

function youtubeThumbnail(thumbnails: any): string | null {
  const value = thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
  return typeof value === 'string' && value.startsWith('https://') ? value : null;
}

export function isMarkedYouTubeShort(title: unknown, description: unknown): boolean {
  const metadata = [title, description].filter((value): value is string => typeof value === 'string').join(' ');
  return /(?:^|\s)#(?:youtube)?shorts?\b/i.test(metadata);
}

type YouTubeFeedCursorState = {
  channelIds: string[];
  offset: number;
  olderOffset: number;
  pageTokens: Record<string, string>;
};

const YOUTUBE_FEED_CHANNEL_BATCH_SIZE = 20;
const YOUTUBE_FEED_ITEMS_PER_CHANNEL = 4;
const YOUTUBE_FEED_CURSOR_TTL_MS = 60 * 60 * 1000;

function parseYouTubeFeedCursorState(raw: string): YouTubeFeedCursorState | null {
  try {
    const value = JSON.parse(raw) as Partial<YouTubeFeedCursorState>;
    if (!Array.isArray(value.channelIds)) return null;
    if (!value.channelIds.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id))) return null;
    if (!Number.isInteger(value.offset) || Number(value.offset) < 0 || Number(value.offset) > value.channelIds.length) return null;
    if (!Number.isInteger(value.olderOffset) || Number(value.olderOffset) < 0 || Number(value.olderOffset) > value.channelIds.length) return null;
    if (!value.pageTokens || typeof value.pageTokens !== 'object' || Array.isArray(value.pageTokens)) return null;
    const pageTokens: Record<string, string> = {};
    for (const [channelId, token] of Object.entries(value.pageTokens)) {
      if (!value.channelIds.includes(channelId) || typeof token !== 'string' || token.length > 512) return null;
      pageTokens[channelId] = token;
    }
    return { channelIds: value.channelIds, offset: Number(value.offset), olderOffset: Number(value.olderOffset), pageTokens };
  } catch {
    return null;
  }
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


  // Kairo-curated YouTube channels. Public reads use a server-held API key;
  // Kairo keeps each user's selected channel list and never exposes the key.
  app.get('/api/v1/youtube/channels', async (c: YouTubeContext) => {
    c.header('Cache-Control', 'no-store');
    const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
    if (!user) return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to manage your Kairo channels.' } }, 401);
    try {
      const result = await c.env.DB.prepare(
        "SELECT channel_id AS channelId, channel_title AS title, description, thumbnail_url AS thumbnailUrl, added_at AS addedAt FROM youtube_feed_channels WHERE user_id=? ORDER BY added_at DESC, channel_title COLLATE NOCASE"
      ).bind(user.id).all();
      return c.json({ success: true, data: { channels: result.results ?? [] }, meta: { requestId: requestId(c) } });
    } catch (error) {
      logYouTubeDiagnostic(c, 'youtube_saved_channels_failed', { errorName: safeErrorName(error) });
      return c.json({ success: false, error: { code: 'YOUTUBE_CHANNELS_UNAVAILABLE', message: 'Your saved channels are temporarily unavailable.' } }, 503);
    }
  });

  app.get('/api/v1/youtube/channels/search', async (c: YouTubeContext) => {
    c.header('Cache-Control', 'no-store');
    const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
    if (!user) return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to search YouTube channels.' } }, 401);
    const term = new URL(c.req.url).searchParams.get('q')?.trim() ?? '';
    if (term.length < 2 || term.length > 80 || /[\u0000-\u001F\u007F]/.test(term)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a channel name or topic between 2 and 80 characters.' } }, 400);
    }
    if (!c.env.YOUTUBE_DATA_API_KEY?.trim()) return youtubeRouteError(c, 'youtube_channel_search_config_unavailable', new Error('YOUTUBE_API_KEY_MISSING'));
    if (!await allowYouTubeRequest(c, user.id, 'channel-search', 5, { bucket: 'search-list-daily', limit: YOUTUBE_SEARCH_DAILY_LIMIT, windowMs: YOUTUBE_DAILY_WINDOW_MS })) {
      return c.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many channel searches. Please try again in 15 minutes.' } }, 429);
    }
    try {
      const apiKey = youtubeApiKey(c);
      const [result, saved] = await Promise.all([
        youtubeApiGet(apiKey, 'search', { part: 'snippet', type: 'channel', maxResults: '18', q: term }),
        c.env.DB.prepare('SELECT channel_id FROM youtube_feed_channels WHERE user_id=?').bind(user.id).all<{ channel_id: string }>(),
      ]);
      const savedIds = new Set((saved.results ?? []).map((row) => row.channel_id));
      const channels = (result.items ?? []).map((item: any) => {
        const snippet = item?.snippet ?? {};
        const id = item?.id?.channelId;
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) return null;
        return {
          channelId: id,
          title: typeof snippet.title === 'string' ? snippet.title : 'YouTube channel',
          description: typeof snippet.description === 'string' ? snippet.description : '',
          thumbnailUrl: youtubeThumbnail(snippet.thumbnails),
          url: 'https://www.youtube.com/channel/' + encodeURIComponent(id),
          isAdded: savedIds.has(id),
        };
      }).filter(Boolean);
      return c.json({ success: true, data: { channels }, meta: { requestId: requestId(c) } });
    } catch (error) {
      return youtubeRouteError(c, 'youtube_channel_search_failed', error);
    }
  });


  app.get('/api/v1/youtube/videos/search', async (c: YouTubeContext) => {
    c.header('Cache-Control', 'no-store');
    // Searching public videos does not require a Kairo or YouTube account.
    // Guests are still rate-limited by client IP and the shared project quota.
    const identity = (await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null))?.id ?? 'guest';

    const params = new URL(c.req.url).searchParams;
    const term = params.get('q')?.trim() ?? '';
    const order = params.get('order') ?? 'relevance';
    const duration = params.get('duration') ?? 'any';
    const pageToken = params.get('pageToken') ?? '';
    if (term.length < 2 || term.length > 80 || /[\u0000-\u001F\u007F]/.test(term)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a video title, topic or creator between 2 and 80 characters.' } }, 400);
    }
    if (!['relevance', 'date', 'viewCount', 'rating', 'title'].includes(order)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose a supported video sort order.' } }, 400);
    }
    if (!['any', 'short', 'medium', 'long'].includes(duration)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose a supported video duration.' } }, 400);
    }
    if (pageToken.length > 512 || /[\u0000-\u001F\u007F]/.test(pageToken)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The search page token is invalid. Start a new search.' } }, 400);
    }
    if (!c.env.YOUTUBE_DATA_API_KEY?.trim()) return youtubeRouteError(c, 'youtube_video_search_config_unavailable', new Error('YOUTUBE_API_KEY_MISSING'));
    if (!await allowYouTubeRequest(c, identity, 'video-search', 8, { bucket: 'search-list-daily', limit: YOUTUBE_SEARCH_DAILY_LIMIT, windowMs: YOUTUBE_DAILY_WINDOW_MS })) {
      return c.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many YouTube video searches. Please try again in 15 minutes.' } }, 429);
    }

    try {
      const apiKey = youtubeApiKey(c);
      const searchParams: Record<string, string> = {
        part: 'snippet',
        type: 'video',
        maxResults: '18',
        q: term,
        order,
        safeSearch: 'moderate',
      };
      if (duration !== 'any') searchParams.videoDuration = duration;
      if (pageToken) searchParams.pageToken = pageToken;
      const result = await youtubeApiGet(apiKey, 'search', searchParams);
      const candidates = (Array.isArray(result.items) ? result.items : []).map((item: any) => {
        const videoId = item?.id?.videoId;
        if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
        const snippet = item?.snippet ?? {};
        const publishedAt = typeof snippet.publishedAt === 'string' && !Number.isNaN(Date.parse(snippet.publishedAt))
          ? new Date(snippet.publishedAt).toISOString()
          : null;
        return {
          videoId,
          title: typeof snippet.title === 'string' ? snippet.title.slice(0, 300) : 'YouTube video',
          description: typeof snippet.description === 'string' ? snippet.description.slice(0, 1000) : '',
          thumbnailUrl: youtubeThumbnail(snippet.thumbnails),
          channelId: typeof snippet.channelId === 'string' ? snippet.channelId.slice(0, 64) : '',
          channelTitle: typeof snippet.channelTitle === 'string' ? snippet.channelTitle.slice(0, 180) : 'YouTube',
          publishedAt,
          durationSeconds: null as number | null,
          url: 'https://www.youtube.com/watch?v=' + videoId,
        };
      }).filter((item: any) => item !== null);
      
      // Duration enrichment is a single inexpensive videos.list request for this result page.
      // Search results remain usable if metadata enrichment is temporarily unavailable.
      const videoIds = candidates.map((video: any) => video.videoId as string);
      if (videoIds.length && await bumpYouTubeRateBucket(c, 'data-api-daily', YOUTUBE_DATA_DAILY_LIMIT, YOUTUBE_DAILY_WINDOW_MS, 1)) {
        try {
          const details = await youtubeApiGet(apiKey, 'videos', { part: 'contentDetails', id: videoIds.join(',') });
          const durationById = new Map<string, number>();
          for (const item of Array.isArray(details.items) ? details.items : []) {
            const id = item?.id;
            const rawDuration = item?.contentDetails?.duration;
            if (typeof id !== 'string' || typeof rawDuration !== 'string') continue;
            const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(rawDuration);
            if (!match) continue;
            const seconds = Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
            if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 604800) durationById.set(id, Math.floor(seconds));
          }
          for (const video of candidates) video.durationSeconds = durationById.get(video.videoId) ?? null;
        } catch (error) {
          logYouTubeDiagnostic(c, 'youtube_video_search_details_failed', { errorName: safeErrorName(error), reason: error instanceof Error ? error.message : 'unknown' });
        }
      }

      const nextPageToken = typeof result.nextPageToken === 'string' && result.nextPageToken.length <= 512 ? result.nextPageToken : null;
      const totalResults = Number(result.pageInfo?.totalResults);
      return c.json({
        success: true,
        data: {
          videos: candidates,
          nextPageToken,
          totalResults: Number.isFinite(totalResults) && totalResults >= 0 ? totalResults : null,
        },
        meta: { requestId: requestId(c) },
      });
    } catch (error) {
      return youtubeRouteError(c, 'youtube_video_search_failed', error);
    }
  });

  app.post('/api/v1/youtube/channels', async (c: any) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    if (!origin || origin !== new URL(c.req.url).origin) {
      return c.json({ success: false, error: { code: 'ORIGIN_FORBIDDEN', message: 'This request origin is not allowed.' } }, 403);
    }
    const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
    if (!user) return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to add channels.' } }, 401);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide valid JSON.' } }, 400); }
    const channelId = typeof body?.channelId === 'string' ? body.channelId.trim() : '';
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(channelId)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose a valid YouTube channel.' } }, 400);
    }
    try {
      const existing = await c.env.DB.prepare('SELECT channel_id FROM youtube_feed_channels WHERE user_id=? AND channel_id=? LIMIT 1')
        .bind(user.id, channelId).first() as { channel_id: string } | null;
      if (existing) return c.json({ success: true, data: { added: false, channelId } });
      if (!c.env.YOUTUBE_DATA_API_KEY?.trim()) return youtubeRouteError(c, 'youtube_channel_add_config_unavailable', new Error('YOUTUBE_API_KEY_MISSING'));
      if (!await allowYouTubeRequest(c, user.id, 'channel-add', 10, { bucket: 'data-api-daily', limit: YOUTUBE_DATA_DAILY_LIMIT, windowMs: YOUTUBE_DAILY_WINDOW_MS })) {
        return c.json({ success: false, error: { code: 'RATE_LIMITED', message: 'YouTube API usage is temporarily limited. Please try again later.' } }, 429);
      }
      const apiKey = youtubeApiKey(c);
      const result = await youtubeApiGet(apiKey, 'channels', { part: 'snippet,contentDetails', id: channelId, maxResults: '1' });
      const channel = result.items?.[0];
      if (!channel || channel.id !== channelId) {
        return c.json({ success: false, error: { code: 'YOUTUBE_CHANNEL_NOT_FOUND', message: 'That channel could not be found.' } }, 404);
      }
      const snippet = channel.snippet ?? {};
      const title = typeof snippet.title === 'string' ? snippet.title.slice(0, 180) : 'YouTube channel';
      const description = typeof snippet.description === 'string' ? snippet.description.slice(0, 1000) : '';
      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
      if (typeof uploadsPlaylistId !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(uploadsPlaylistId)) {
        return c.json({ success: false, error: { code: 'YOUTUBE_CHANNEL_UNAVAILABLE', message: 'This channel does not currently expose a public uploads playlist.' } }, 422);
      }
      await c.env.DB.prepare(
        'INSERT INTO youtube_feed_channels (user_id,channel_id,channel_title,description,thumbnail_url,upload_playlist_id) VALUES (?,?,?,?,?,?)'
      ).bind(user.id, channelId, title, description, youtubeThumbnail(snippet.thumbnails), uploadsPlaylistId).run();
      return c.json({ success: true, data: { added: true, channel: { channelId, title, description, thumbnailUrl: youtubeThumbnail(snippet.thumbnails) } } }, 201);
    } catch (error) {
      return youtubeRouteError(c, 'youtube_channel_add_failed', error);
    }
  });

  app.delete('/api/v1/youtube/channels/:channelId', async (c: any) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    if (!origin || origin !== new URL(c.req.url).origin) {
      return c.json({ success: false, error: { code: 'ORIGIN_FORBIDDEN', message: 'This request origin is not allowed.' } }, 403);
    }
    const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
    if (!user) return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to remove channels.' } }, 401);
    const channelId = c.req.param('channelId');
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(channelId)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Choose a valid YouTube channel.' } }, 400);
    }
    try {
      await c.env.DB.prepare('DELETE FROM youtube_feed_channels WHERE user_id=? AND channel_id=?').bind(user.id, channelId).run();
      return c.json({ success: true, data: { removed: true, channelId } });
    } catch (error) {
      logYouTubeDiagnostic(c, 'youtube_channel_remove_failed', { errorName: safeErrorName(error) });
      return c.json({ success: false, error: { code: 'YOUTUBE_CHANNELS_UNAVAILABLE', message: 'Could not remove that channel. Please try again.' } }, 503);
    }
  });

  app.get('/api/v1/youtube/feed', async (c: YouTubeContext) => {
    c.header('Cache-Control', 'no-store');
    const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
    if (!user) return c.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to view your Kairo feed.' } }, 401);
    if (!await allowYouTubeRequest(c, user.id, 'feed-page', 30)) {
      return c.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Your feed is loading too quickly. Please try again in 15 minutes.' } }, 429);
    }

    const requestedCursor = new URL(c.req.url).searchParams.get('cursor');
    if (requestedCursor && !/^[A-Za-z0-9_-]{32}$/.test(requestedCursor)) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The feed cursor is invalid. Refresh your feed and try again.' } }, 400);
    }

    try {
      const saved = await c.env.DB.prepare(
        'SELECT channel_id AS channelId, channel_title AS title, thumbnail_url AS thumbnailUrl, upload_playlist_id AS uploadPlaylistId FROM youtube_feed_channels WHERE user_id=? ORDER BY added_at DESC, channel_title COLLATE NOCASE'
      ).bind(user.id).all<{ channelId: string; title: string; thumbnailUrl: string | null; uploadPlaylistId: string | null }>();
      const channels = saved.results ?? [];
      if (!channels.length) {
        if (requestedCursor) await c.env.DB.prepare('DELETE FROM youtube_feed_cursors WHERE id=? AND user_id=?').bind(requestedCursor, user.id).run();
        return c.json({ success: true, data: { videos: [], channels: [], channelsChecked: 0, nextCursor: null }, meta: { requestId: requestId(c) } });
      }

      await c.env.DB.prepare('DELETE FROM youtube_feed_cursors WHERE expires_at<=?').bind(Date.now()).run();
      let cursorId = requestedCursor;
      let state: YouTubeFeedCursorState = {
        channelIds: channels.map((channel) => channel.channelId),
        offset: 0,
        olderOffset: 0,
        pageTokens: {},
      };
      if (requestedCursor) {
        const stored = await c.env.DB.prepare(
          'SELECT state_json AS stateJson FROM youtube_feed_cursors WHERE id=? AND user_id=? AND expires_at>? LIMIT 1'
        ).bind(requestedCursor, user.id, Date.now()).first<{ stateJson: string }>();
        const parsed = stored?.stateJson ? parseYouTubeFeedCursorState(stored.stateJson) : null;
        if (!parsed) {
          return c.json({ success: false, error: { code: 'YOUTUBE_FEED_CURSOR_EXPIRED', message: 'This feed page has expired. Refresh your feed to continue.' } }, 410);
        }
        const currentIds = channels.map((channel) => channel.channelId);
        if (parsed.channelIds.length === currentIds.length && parsed.channelIds.every((id, index) => id === currentIds[index])) {
          state = parsed;
        }
        // When the channel selection changes, restart from the newest uploads using the same cursor.
      }

      const loadingOlderUploads = state.offset >= state.channelIds.length;
      let batchChannelIds: string[];
      if (!loadingOlderUploads) {
        batchChannelIds = state.channelIds.slice(state.offset, state.offset + YOUTUBE_FEED_CHANNEL_BATCH_SIZE);
      } else {
        const activeChannelIds = state.channelIds.filter((id) => Boolean(state.pageTokens[id]));
        if (!activeChannelIds.length) {
          if (cursorId) await c.env.DB.prepare('DELETE FROM youtube_feed_cursors WHERE id=? AND user_id=?').bind(cursorId, user.id).run();
          return c.json({ success: true, data: { videos: [], channels: [], channelsChecked: 0, nextCursor: null }, meta: { requestId: requestId(c) } });
        }
        const startAt = activeChannelIds.findIndex((id) => state.channelIds.indexOf(id) >= state.olderOffset);
        const rotation = startAt >= 0 ? startAt : 0;
        batchChannelIds = [...activeChannelIds.slice(rotation), ...activeChannelIds.slice(0, rotation)].slice(0, YOUTUBE_FEED_CHANNEL_BATCH_SIZE);
      }
      const batchChannels = batchChannelIds.map((id) => channels.find((channel) => channel.channelId === id)).filter((channel): channel is NonNullable<typeof channel> => Boolean(channel));
      if (!batchChannels.length) {
        return c.json({ success: true, data: { videos: [], channels, channelsChecked: 0, nextCursor: null }, meta: { requestId: requestId(c) } });
      }

      const channelsNeedingPlaylist = batchChannels.filter((channel: any) => !channel.uploadPlaylistId);
      const estimatedUnits = batchChannels.length + (channelsNeedingPlaylist.length ? 1 : 0);
      if (!c.env.YOUTUBE_DATA_API_KEY?.trim()) return youtubeRouteError(c, 'youtube_feed_config_unavailable', new Error('YOUTUBE_API_KEY_MISSING'));
      if (!await bumpYouTubeRateBucket(c, 'data-api-daily', YOUTUBE_DATA_DAILY_LIMIT, YOUTUBE_DAILY_WINDOW_MS, estimatedUnits)) {
        return c.json({ success: false, error: { code: 'RATE_LIMITED', message: 'YouTube API usage is temporarily limited. Please try again later.' } }, 429);
      }

      const apiKey = youtubeApiKey(c);
      const playlistIds = new Map<string, string>();
      for (const channel of batchChannels) {
        if (channel.uploadPlaylistId) playlistIds.set(channel.channelId, channel.uploadPlaylistId);
      }
      if (channelsNeedingPlaylist.length) {
        const channelData = await youtubeApiGet(apiKey, 'channels', {
          part: 'contentDetails',
          id: channelsNeedingPlaylist.map((channel: any) => channel.channelId).join(','),
          maxResults: String(channelsNeedingPlaylist.length),
        });
        for (const channel of channelData.items ?? []) {
          const playlistId = channel?.contentDetails?.relatedPlaylists?.uploads;
          if (typeof channel?.id !== 'string' || typeof playlistId !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(playlistId)) continue;
          playlistIds.set(channel.id, playlistId);
          await c.env.DB.prepare(
            'UPDATE youtube_feed_channels SET upload_playlist_id=? WHERE user_id=? AND channel_id=? AND upload_playlist_id IS NULL'
          ).bind(playlistId, user.id, channel.id).run();
        }
      }
      const uploads = batchChannels.filter((channel: any) => playlistIds.has(channel.channelId));

      const batches = await Promise.all(uploads.map(async (channel: any) => {
        const pageToken = loadingOlderUploads ? state.pageTokens[channel.channelId] : undefined;
        const result = await youtubeApiGet(apiKey, 'playlistItems', {
          part: 'snippet,contentDetails',
          playlistId: playlistIds.get(channel.channelId)!,
          maxResults: String(YOUTUBE_FEED_ITEMS_PER_CHANNEL),
          ...(pageToken ? { pageToken } : {}),
        });
        if (typeof result.nextPageToken === 'string' && result.nextPageToken.length <= 512) {
          state.pageTokens[channel.channelId] = result.nextPageToken;
        } else {
          delete state.pageTokens[channel.channelId];
        }
        return (result.items ?? []).map((item: any) => {
          const snippet = item?.snippet ?? {};
          const videoId = snippet?.resourceId?.videoId;
          if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
          const title = typeof snippet.title === 'string' ? snippet.title : 'Untitled video';
          const description = typeof snippet.description === 'string' ? snippet.description : '';
          if (isMarkedYouTubeShort(title, description)) return null;
          const publishedAt = item?.contentDetails?.videoPublishedAt ?? snippet.publishedAt ?? null;
          return {
            videoId,
            title,
            description,
            thumbnail: youtubeThumbnail(snippet.thumbnails),
            channelId: channel.channelId,
            channelTitle: typeof snippet.channelTitle === 'string' ? snippet.channelTitle : channel.title,
            publishedAt: typeof publishedAt === 'string' ? publishedAt : null,
            url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId),
          };
        }).filter(Boolean);
      }));

      const videos = batches.flat().sort((a: any, b: any) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''));
      if (loadingOlderUploads) {
        const lastChannelIndex = state.channelIds.indexOf(batchChannelIds[batchChannelIds.length - 1]);
        state.olderOffset = state.channelIds.length ? (lastChannelIndex + 1) % state.channelIds.length : 0;
      } else {
        state.offset = Math.min(state.channelIds.length, state.offset + batchChannels.length);
        state.olderOffset = 0;
      }
      const hasMoreChannelBatches = state.offset < state.channelIds.length;
      const hasOlderUploads = Object.keys(state.pageTokens).length > 0;
      const hasMore = hasMoreChannelBatches || hasOlderUploads;

      if (hasMore) {
        cursorId = cursorId ?? random(24);
        await c.env.DB.prepare(`
          INSERT INTO youtube_feed_cursors (id,user_id,state_json,expires_at)
          VALUES (?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            state_json=excluded.state_json,
            expires_at=excluded.expires_at,
            updated_at=CURRENT_TIMESTAMP
        `).bind(cursorId, user.id, JSON.stringify(state), Date.now() + YOUTUBE_FEED_CURSOR_TTL_MS).run();
      } else if (cursorId) {
        await c.env.DB.prepare('DELETE FROM youtube_feed_cursors WHERE id=? AND user_id=?').bind(cursorId, user.id).run();
        cursorId = null;
      }

      return c.json({
        success: true,
        data: { videos, channels: batchChannels.map(({ channelId, title, thumbnailUrl }) => ({ channelId, title, thumbnailUrl })), channelsChecked: uploads.length, nextCursor: hasMore ? cursorId : null },
        meta: { requestId: requestId(c) },
      });
    } catch (error) {
      return youtubeRouteError(c, 'youtube_feed_failed', error);
    }
  });


}
