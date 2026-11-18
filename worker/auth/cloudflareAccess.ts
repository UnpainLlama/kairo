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

/** Test-only reset so JWKS rotation and cache cases remain isolated between tests. */
export function resetAccessJwksCacheForTests(): void {
  jwksCache = null;
  jwksFetch = null;
}
