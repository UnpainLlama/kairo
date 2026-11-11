const SESSION_COOKIE = 'kairo_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionUser = {
  id: string;
  displayName: string;
  email: string | null;
  emailVerifiedAt: string | null;
  role: 'user' | 'admin';
};

type SessionRow = {
  id: string;
  userId: string;
  displayName: string;
  email: string | null;
  emailVerifiedAt: string | null;
  role: 'user' | 'admin';
};

export function createOpaqueToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : null;
  }
  return null;
}

export function sessionCookie(token: string, secure = true): string {
  const flags = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearSessionCookie(secure = true): string {
  const flags = [`${SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

/** Resolve the current Kairo identity exclusively from the server-side session cookie. */
export async function findSessionUser(db: D1Database, cookieHeader: string | null): Promise<SessionUser | null> {
  const token = readSessionCookie(cookieHeader);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await db.prepare(
    `SELECT s.id, s.user_id AS userId, p.display_name AS displayName,
            p.email, p.email_verified_at AS emailVerifiedAt, p.role
     FROM sessions s
     INNER JOIN user_profiles p ON p.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?
       AND p.account_status = 'active'
     LIMIT 1`
  ).bind(tokenHash, Date.now()).first<SessionRow>();
  if (!row) return null;
  return {
    id: row.userId,
    displayName: row.displayName,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    role: row.role,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
