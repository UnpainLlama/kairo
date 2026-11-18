import { normalizeAccessEmail } from '../auth/cloudflareAccess';
import { hashPassword, isNewPasswordValid } from '../auth/password';
import { createSession, sessionCookie, findSessionUser } from '../auth/session';

const enc = new TextEncoder();
const usernameOf = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const valueTrimmed = value.trim();
  return valueTrimmed.length >= 3 && valueTrimmed.length <= 64 && /^[A-Za-z0-9._-]+$/.test(valueTrimmed)
    ? valueTrimmed : null;
};
const passwordOf = isNewPasswordValid;
const fail = (c: any, status: number, code: string, message: string) =>
  c.json({ success: false, error: { code, message } }, status);
const ok = (c: any, data: unknown, status = 200) =>
  c.json({ success: true, data }, status);


async function currentAdmin(c: any) {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null, Date.now(), c.get('accessEmail') as string | null | undefined);
  return user?.role === 'admin' ? user : null;
}

function newConsolePath(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return '/' + btoa(binary).replace(/=/g, '').replaceAll('+', '-').replaceAll('/', '_');
}

async function ensureConsolePath(db: D1Database): Promise<string | null> {
  const now = Date.now();
  const existing = await db.prepare('SELECT path_value AS pathValue FROM admin_console_access WHERE singleton_id=1 AND expires_at>?')
    .bind(now).first<{ pathValue: string }>();
  if (existing?.pathValue) return existing.pathValue;
  const path = newConsolePath();
  await db.prepare(`INSERT INTO admin_console_access (singleton_id,path_value,rotated_at,expires_at)
    VALUES (1,?,?,?)
    ON CONFLICT(singleton_id) DO UPDATE SET path_value=excluded.path_value,
      rotated_at=excluded.rotated_at, expires_at=excluded.expires_at
    WHERE admin_console_access.expires_at <= ?`)
    .bind(path, now, now + 30 * 60 * 1000, now).run();
  const current = await db.prepare('SELECT path_value AS pathValue FROM admin_console_access WHERE singleton_id=1 AND expires_at>?')
    .bind(now).first<{ pathValue: string }>();
  return current?.pathValue ?? null;
}

export async function rotateAdminConsolePath(db: D1Database): Promise<void> {
  const admin = await db.prepare("SELECT id FROM user_profiles WHERE role='admin' AND account_status='active' LIMIT 1").first();
  if (!admin) return;
  const now = Date.now();
  const path = newConsolePath();
  await db.prepare(`INSERT INTO admin_console_access (singleton_id,path_value,rotated_at,expires_at)
    VALUES (1,?,?,?)
    ON CONFLICT(singleton_id) DO UPDATE SET path_value=excluded.path_value,
      rotated_at=excluded.rotated_at, expires_at=excluded.expires_at`)
    .bind(path, now, now + 30 * 60 * 1000).run();
}

function originAllowed(c: any) {
  const expected = new URL(c.req.url).origin;
  const origin = c.req.header('Origin');
  if (origin) return origin === expected;
  const referer = c.req.header('Referer');
  if (!referer) return false;
  try { return new URL(referer).origin === expected; } catch { return false; }
}

async function permitBootstrapAttempt(db: D1Database, ip: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode('admin-bootstrap:' + ip));
  const key = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO auth_rate_limits(bucket_key,window_started_at,attempts) VALUES(?,?,1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      attempts=CASE WHEN window_started_at<=? THEN 1 ELSE attempts+1 END,
      window_started_at=CASE WHEN window_started_at<=? THEN ? ELSE window_started_at END
    RETURNING attempts`)
    .bind(key, now, now - 15 * 60 * 1000, now - 15 * 60 * 1000, now)
    .first<{ attempts: number }>();
  return Number(row?.attempts ?? 11) <= 10;
}
function noStore(c: any) {
  c.header('Cache-Control', 'no-store');
}
function sameSecret(a: string, b: string): boolean {
  const left = enc.encode(a), right = enc.encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

export function registerAdminRoutes(app: any) {
  app.get('/api/v1/admin/console-path', async (c: any) => {
    noStore(c);
    const admin = await currentAdmin(c);
    if (!admin) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    try {
      const path = await ensureConsolePath(c.env.DB);
      if (!path) return fail(c, 503, 'ADMIN_CONSOLE_UNAVAILABLE', 'The administrator console is temporarily unavailable.');
      return ok(c, { path, expiresInSeconds: 1800 });
    } catch {
      return fail(c, 503, 'ADMIN_CONSOLE_UNAVAILABLE', 'The administrator console is temporarily unavailable.');
    }
  });

  // First administrator setup is guarded by a one-time Worker secret and closes permanently after creation.
  app.post('/api/v1/admin/bootstrap', async (c: any) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const expected = c.env.ADMIN_BOOTSTRAP_TOKEN;
    const supplied = c.req.header('X-Kairo-Bootstrap');
    const bootstrapIp = c.req.header('CF-Connecting-IP') ?? 'unknown';
    if (!await permitBootstrapAttempt(c.env.DB, bootstrapIp)) {
      return fail(c, 429, 'RATE_LIMITED', 'Too many administrator setup attempts. Try again in 15 minutes.');
    }
    if (typeof expected !== 'string' || expected.length < 32 || !supplied || !sameSecret(expected, supplied)) {
      return fail(c, 404, 'NOT_FOUND', 'Not found.');
    }
    const setupState = await c.env.DB.prepare('SELECT admin_bootstrap_completed_at AS completedAt FROM app_security_state WHERE singleton_id=1').first() as { completedAt: number | null } | null;
    if (!setupState || setupState.completedAt !== null) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    const body: any = await c.req.json().catch(() => null);
    const username = usernameOf(body?.username);
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    const assertedEmail = normalizeAccessEmail(c.get('accessEmail'));
    const submittedEmail = normalizeAccessEmail(body?.accessEmail);
    const accessEmail = c.env.ACCESS_ENFORCED === 'true' ? assertedEmail : (submittedEmail ?? assertedEmail);
    if (!username || displayName.length < 2 || displayName.length > 40 || !passwordOf(body?.password) ||
        !accessEmail || (assertedEmail && submittedEmail && assertedEmail !== submittedEmail)) {
      return fail(c, 400, 'VALIDATION_ERROR', 'Provide a valid username, display name, approved email address, and password of at least 15 characters.');
    }
    try {
      const uid = crypto.randomUUID(), identityId = crypto.randomUUID(), now = Date.now();
      const passwordHash = await hashPassword(body.password);
      const results = await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO user_profiles (id,identity_subject,display_name,username,access_email,account_status,role) SELECT ?,?,?,?,?, 'active','admin' WHERE EXISTS (SELECT 1 FROM app_security_state WHERE singleton_id=1 AND admin_bootstrap_completed_at IS NULL) AND NOT EXISTS (SELECT 1 FROM user_profiles WHERE role='admin')")
          .bind(uid, 'closed-admin:' + crypto.randomUUID(), displayName, username, accessEmail),
        c.env.DB.prepare("INSERT INTO auth_identities (id,user_id,provider,provider_subject) SELECT ?,id,'email',? FROM user_profiles WHERE id=?")
          .bind(identityId, username, uid),
        c.env.DB.prepare('INSERT INTO password_credentials (auth_identity_id,password_hash) SELECT ?,? FROM auth_identities WHERE id=?')
          .bind(identityId, passwordHash, identityId),
        c.env.DB.prepare("UPDATE app_security_state SET admin_bootstrap_completed_at=? WHERE singleton_id=1 AND admin_bootstrap_completed_at IS NULL AND EXISTS (SELECT 1 FROM user_profiles WHERE id=? AND role='admin')")
          .bind(now, uid),
      ]);
      if (Number(results[0]?.meta?.changes ?? 0) !== 1 || Number(results[3]?.meta?.changes ?? 0) !== 1) return fail(c, 409, 'ADMIN_ALREADY_EXISTS', 'Administrator setup is no longer available.');
      const session = await createSession(c.env.DB, uid, {
        userAgent: c.req.header('User-Agent') ?? undefined,
        ipPrefix: c.req.header('CF-Connecting-IP') ?? 'unknown',
        ttlSeconds: 8 * 60 * 60,
        accessEmail: c.env.ACCESS_ENFORCED === 'true' ? accessEmail : null,
      });
      c.header('Set-Cookie', sessionCookie(session.token, new URL(c.req.url).protocol === 'https:', session.ttlSeconds));
      const path = await ensureConsolePath(c.env.DB);
      return ok(c, { created: true, signedIn: true, administrator: true, username, path }, 201);
    } catch {
      return fail(c, 409, 'ADMIN_SETUP_FAILED', 'Administrator setup could not be completed. Check that the username is unique.');
    }
  });

  app.get('/api/v1/admin/accounts', async (c: any) => {
    noStore(c);
    const admin = await currentAdmin(c);
    if (!admin) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    try {
      const [accounts, count] = await Promise.all([
        c.env.DB.prepare("SELECT id,username,access_email AS accessEmail,display_name AS displayName,account_status AS status,created_at AS createdAt FROM user_profiles WHERE role='user' ORDER BY created_at ASC").all(),
        c.env.DB.prepare("SELECT COUNT(*) AS count FROM user_profiles WHERE role='user'").first() as Promise<{ count: number } | null>,
      ]);
      return ok(c, { accounts: accounts.results ?? [], standardAccountCount: Number(count?.count ?? 0), standardAccountLimit: 15 });
    } catch {
      return fail(c, 503, 'ADMIN_UNAVAILABLE', 'Account management is temporarily unavailable.');
    }
  });

  app.post('/api/v1/admin/accounts', async (c: any) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const admin = await currentAdmin(c);
    if (!admin) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    const body: any = await c.req.json().catch(() => null);
    const username = usernameOf(body?.username);
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    const accessEmail = normalizeAccessEmail(body?.accessEmail);
    if (!username || displayName.length < 2 || displayName.length > 40 || !accessEmail || !passwordOf(body?.password)) {
      return fail(c, 400, 'VALIDATION_ERROR', 'Provide a valid username, approved email address, display name, and password of at least 15 characters.');
    }
    try {
      const uid = crypto.randomUUID(), identityId = crypto.randomUUID();
      const passwordHash = await hashPassword(body.password);
      const results = await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO user_profiles (id,identity_subject,display_name,username,access_email,account_status,role) SELECT ?,?,?,?,?, 'active','user' WHERE (SELECT COUNT(*) FROM user_profiles WHERE role='user') < 15")
          .bind(uid, 'closed-user:' + crypto.randomUUID(), displayName, username, accessEmail),
        c.env.DB.prepare("INSERT INTO auth_identities (id,user_id,provider,provider_subject) SELECT ?,id,'email',? FROM user_profiles WHERE id=?")
          .bind(identityId, username, uid),
        c.env.DB.prepare('INSERT INTO password_credentials (auth_identity_id,password_hash) SELECT ?,? FROM auth_identities WHERE id=?')
          .bind(identityId, passwordHash, identityId),
      ]);
      if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
        return fail(c, 409, 'ACCOUNT_LIMIT_REACHED', 'All 15 standard accounts have already been allocated.');
      }
      return ok(c, { created: true, account: { id: uid, username, accessEmail, displayName, status: 'active' } }, 201);
    } catch {
      return fail(c, 409, 'ACCOUNT_CREATE_FAILED', 'The account could not be created. Check that its username is unique.');
    }
  });

  app.patch('/api/v1/admin/accounts/:id/access-email', async (c: any) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const admin = await currentAdmin(c);
    if (!admin) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    const body: any = await c.req.json().catch(() => null);
    const accessEmail = normalizeAccessEmail(body?.accessEmail);
    if (!accessEmail) return fail(c, 400, 'VALIDATION_ERROR', 'Provide a valid approved email address.');
    try {
      const targetId = c.req.param('id');
      const result = await c.env.DB.prepare("UPDATE user_profiles SET access_email=? WHERE id=? AND role='user' AND account_status IN ('active','suspended')")
        .bind(accessEmail, targetId).run();
      if (Number(result.meta?.changes ?? 0) !== 1) return fail(c, 404, 'ACCOUNT_NOT_FOUND', 'That standard account was not found.');
      await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(targetId).run();
      return ok(c, { updated: true, accessEmail, sessionsRevoked: true });
    } catch {
      return fail(c, 409, 'ACCESS_EMAIL_IN_USE', 'That approved email address is already assigned to another Kairo account.');
    }
  });

  app.patch('/api/v1/admin/accounts/:id/status', async (c: any) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const admin = await currentAdmin(c);
    if (!admin) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    const body: any = await c.req.json().catch(() => null);
    if (body?.status !== 'active' && body?.status !== 'suspended') return fail(c, 400, 'VALIDATION_ERROR', 'Status must be active or suspended.');
    const targetId = c.req.param('id');
    const results = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE user_profiles SET account_status=? WHERE id=? AND role='user' AND account_status IN ('active','suspended')")
        .bind(body.status, targetId),
      c.env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND ?='suspended'")
        .bind(targetId, body.status),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) return fail(c, 404, 'ACCOUNT_NOT_FOUND', 'That standard account was not found.');
    return ok(c, { updated: true, status: body.status, sessionsRevoked: body.status === 'suspended' });
  });

  app.post('/api/v1/admin/accounts/:id/password', async (c: any) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const admin = await currentAdmin(c);
    if (!admin) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    const body: any = await c.req.json().catch(() => null);
    if (!passwordOf(body?.password)) return fail(c, 400, 'VALIDATION_ERROR', 'Password must contain at least 15 characters.');
    try {
      const target = c.req.param('id');
      const exists = await c.env.DB.prepare("SELECT id FROM user_profiles WHERE id=? AND role='user' AND account_status IN ('active','suspended')").bind(target).first();
      if (!exists) return fail(c, 404, 'ACCOUNT_NOT_FOUND', 'That standard account was not found.');
      const hash = await hashPassword(body.password);
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO auth_identities (id,user_id,provider,provider_subject) SELECT ?,id,'email',username FROM user_profiles WHERE id=? AND role='user' AND account_status IN ('active','suspended') ON CONFLICT(user_id,provider) DO NOTHING")
          .bind(crypto.randomUUID(), target),
        c.env.DB.prepare("INSERT INTO password_credentials (auth_identity_id,password_hash) SELECT id,? FROM auth_identities WHERE user_id=? AND provider='email' ON CONFLICT(auth_identity_id) DO UPDATE SET password_hash=excluded.password_hash,password_changed_at=CURRENT_TIMESTAMP")
          .bind(hash, target),
        c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(target),
      ]);
      return ok(c, { passwordReset: true, sessionsRevoked: true });
    } catch {
      return fail(c, 503, 'ADMIN_UNAVAILABLE', 'The password could not be reset.');
    }
  });
}
