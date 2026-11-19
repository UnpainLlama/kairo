export type AccessIdentity = {
  email: string;
  subject: string;
};

type AccessBindings = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};

type AccessJwtHeader = { alg?: string; kid?: string; typ?: string };
type AccessJwtClaims = {
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  sub?: string;
  type?: string;
  email?: string;
  common_name?: string;
  service_token_status?: boolean;
};

type AccessJwk = JsonWebKey & { kid?: string; use?: string; alg?: string };
type AccessJwks = { keys?: AccessJwk[] };

let jwksCache: { issuer: string; keys: AccessJwk[]; expiresAt: number } | null = null;
let jwksFetch: Promise<AccessJwk[]> | null = null;

const CLOCK_SKEW_SECONDS = 60;
const JWKS_CACHE_MS = 15 * 60 * 1000;
const utf8 = new TextDecoder();

function base64UrlBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_base64url');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(segment: string): T {
  const bytes = base64UrlBytes(segment);
  return JSON.parse(utf8.decode(bytes)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTeamIssuer(value: string | undefined): string | null {
  if (!value || value.length > 255) return null;
  try {
    const candidate = value.includes('://') ? new URL(value) : new URL('https://' + value);
    if (candidate.protocol !== 'https:' || candidate.username || candidate.password ||
        candidate.port || candidate.pathname !== '/' || candidate.search || candidate.hash ||
        !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(candidate.hostname)) return null;
    return 'https://' + candidate.hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function fetchAccessJwks(issuer: string, forceRefresh = false): Promise<AccessJwk[]> {
  const now = Date.now();
  if (!forceRefresh && jwksCache?.issuer === issuer && jwksCache.expiresAt > now) return jwksCache.keys;
  if (jwksFetch) return jwksFetch;
  jwksFetch = (async () => {
    const response = await fetch(issuer + '/cdn-cgi/access/certs', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('access_jwks_unavailable');
    const body = await response.json() as AccessJwks;
    if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 20) {
      throw new Error('access_jwks_invalid');
    }
    const keys = body.keys.filter((key) =>
      key.kty === 'RSA' && typeof key.kid === 'string' && key.kid.length <= 128 &&
      (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256') &&
      typeof key.n === 'string' && typeof key.e === 'string');
    if (keys.length === 0) throw new Error('access_jwks_no_signing_keys');
    jwksCache = { issuer, keys, expiresAt: Date.now() + JWKS_CACHE_MS };
    return keys;
  })();
  try {
    return await jwksFetch;
  } finally {
    jwksFetch = null;
  }
}

export function normalizeAccessEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function verifySignature(
  signingInput: string,
  signatureSegment: string,
  key: AccessJwk,
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      base64UrlBytes(signatureSegment),
      new TextEncoder().encode(signingInput),
    );
  } catch {
    return false;
  }
}

/**
 * Verifies a Cloudflare Access application JWT. The team issuer is constructed
 * from trusted Worker configuration; an untrusted token cannot choose its JWKS URL.
 */
export async function verifyCloudflareAccessAssertion(
  token: string | null,
  bindings: AccessBindings,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AccessIdentity | null> {
  const issuer = normalizeTeamIssuer(bindings.ACCESS_TEAM_DOMAIN);
  const audience = bindings.ACCESS_AUD?.trim();
  if (!issuer || !audience || audience.length > 256 || !token || token.length > 16_384) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let headerValue: unknown;
  let claimsValue: unknown;
  try {
    headerValue = decodeJson<unknown>(parts[0]);
    claimsValue = decodeJson<unknown>(parts[1]);
  } catch {
    return null;
  }
  if (!isRecord(headerValue) || !isRecord(claimsValue)) return null;
  const header = headerValue as AccessJwtHeader;
  const claims = claimsValue as AccessJwtClaims;

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 128 ||
      claims.iss !== issuer ||
      !Array.isArray(claims.aud) && typeof claims.aud !== 'string' ||
      !(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience) ||
      typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) ||
      claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS ||
      (claims.iat !== undefined && (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS)) ||
      (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS)) ||
      (claims.sub !== undefined && (typeof claims.sub !== 'string' || !claims.sub.trim())) ||
      typeof claims.email !== 'string' || claims.service_token_status === true ||
      typeof claims.common_name === 'string') return null;

  let keys: AccessJwk[];
  try {
    keys = await fetchAccessJwks(issuer);
  } catch {
    return null;
  }
  let key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    try {
      keys = await fetchAccessJwks(issuer, true);
      key = keys.find((candidate) => candidate.kid === header.kid);
    } catch {
      return null;
    }
  }
  if (!key || !(await verifySignature(parts[0] + '.' + parts[1], parts[2], key))) return null;

  const email = normalizeAccessEmail(claims.email);
  if (!email) return null;
  return { email, subject: typeof claims.sub === 'string' ? claims.sub : email };
}


/**
 * Resolve a verified Cloudflare Access email to its Kairo account.
 *
 * Cloudflare Access is the invitation boundary: its per-application Allow policy
 * must contain individual email addresses. A valid, signed Access assertion is
 * therefore sufficient to create the corresponding standard Kairo profile.
 * Existing profiles retain their role and account status; suspended/deleted
 * profiles are never silently reactivated.
 *
 * Legacy profiles whose verified email matches but which predate access_email
 * are linked in place so their existing libraries and history are preserved.
 */
export async function hasActiveAccessAccount(db: D1Database, emailValue: string): Promise<boolean> {
  const email = normalizeAccessEmail(emailValue);
  if (!email) return false;

  // Before the first administrator has been bootstrapped, Access-approved
  // visitors may reach the one-time setup page but must not be auto-created as
  // standard users. The bootstrap token protects the only route that can create
  // the initial administrator. This also avoids a first /api/v1/me request
  // claiming the intended admin email as a standard account.
  try {
    const bootstrap = await db.prepare(
      `SELECT admin_bootstrap_completed_at AS completedAt,
              EXISTS (SELECT 1 FROM user_profiles WHERE role = 'admin') AS adminExists
       FROM app_security_state WHERE singleton_id = 1`,
    ).first<{ completedAt: number | null; adminExists: number }>();
    if (bootstrap && bootstrap.completedAt === null && Number(bootstrap.adminExists) === 0) return true;
  } catch {
    // An unavailable security-state table is not a reason to grant access.
    return false;
  }

  const byAccessEmail = await db.prepare(
    'SELECT id, account_status AS accountStatus FROM user_profiles WHERE access_email = ? COLLATE NOCASE LIMIT 1',
  ).bind(email).first<{ id: string; accountStatus: string }>();
  if (byAccessEmail) return byAccessEmail.accountStatus === 'active';

  const legacy = await db.prepare(
    'SELECT id, account_status AS accountStatus, access_email AS accessEmail FROM user_profiles WHERE email = ? COLLATE NOCASE LIMIT 1',
  ).bind(email).first<{ id: string; accountStatus: string; accessEmail: string | null }>();
  if (legacy) {
    if (legacy.accountStatus !== 'active' || legacy.accessEmail) return false;
    try {
      await db.prepare(
        "UPDATE user_profiles SET access_email = ?, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND access_email IS NULL AND account_status = 'active'",
      ).bind(email, legacy.id).run();
    } catch {
      // A conflicting email binding must fail closed.
    }
    const linked = await db.prepare(
      'SELECT id, account_status AS accountStatus FROM user_profiles WHERE access_email = ? COLLATE NOCASE LIMIT 1',
    ).bind(email).first<{ id: string; accountStatus: string }>();
    return Boolean(linked?.id && linked.accountStatus === 'active');
  }

  // Username is no longer a credential. Keep a deterministic, non-email handle
  // only for legacy UI/schema fields that still expect one.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  const suffix = [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const username = 'access_' + suffix;
  const localPart = (email.split('@')[0] ?? '').split('+')[0];
  const displayName = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || 'Kairo member';

  try {
    await db.prepare(
      `INSERT OR IGNORE INTO user_profiles
        (id, identity_subject, display_name, email, email_verified_at, username,
         access_email, account_status, role)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 'active', 'user')`,
    ).bind(crypto.randomUUID(), 'cloudflare-access:' + email, displayName, email, username, email).run();
  } catch {
    // The account cap, unique indexes, or schema constraints may reject a new
    // profile. Do not grant access when account provisioning did not succeed.
    return false;
  }

  const provisioned = await db.prepare(
    'SELECT id, account_status AS accountStatus FROM user_profiles WHERE access_email = ? COLLATE NOCASE LIMIT 1',
  ).bind(email).first<{ id: string; accountStatus: string }>();
  return Boolean(provisioned?.id && provisioned.accountStatus === 'active');
}

/** Test-only reset so JWKS rotation and cache cases remain isolated between tests. */
export function resetAccessJwksCacheForTests(): void {
  jwksCache = null;
  jwksFetch = null;
}
