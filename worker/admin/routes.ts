import { hashPassword } from '../auth/password';
import { findSessionUser } from '../auth/session';

const enc = new TextEncoder();
const usernameOf = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const valueTrimmed = value.trim();
  return valueTrimmed.length >= 3 && valueTrimmed.length <= 64 && /^[A-Za-z0-9._-]+$/.test(valueTrimmed)
    ? valueTrimmed : null;
};
const passwordOf = (value: unknown): value is string =>
  typeof value === 'string' && enc.encode(value).length >= 12 && enc.encode(value).length <= 1024;
const fail = (c: any, status: number, code: string, message: string) =>
  c.json({ success: false, error: { code, message } }, status);
const ok = (c: any, data: unknown, status = 200) =>
  c.json({ success: true, data }, status);


async function currentAdmin(c: any) {
  const user = await findSessionUser(c.env.DB, c.req.header('Cookie') ?? null);
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
  const origin = c.req.header('Origin');
  return !origin || origin === new URL(c.req.url).origin;
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

  // One-time bootstrap: requires a separately configured Cloudflare Worker secret.
  app.post('/api/v1/admin/bootstrap', async (c: any) => {
    noStore(c);
    if (!originAllowed(c)) return fail(c, 403, 'ORIGIN_FORBIDDEN', 'This request origin is not allowed.');
    const expected = c.env.ADMIN_BOOTSTRAP_TOKEN;
    const supplied = c.req.header('X-Kairo-Bootstrap');
    if (typeof expected !== 'string' || expected.length < 32 || !supplied || !sameSecret(expected, supplied)) {
      return fail(c, 404, 'NOT_FOUND', 'Not found.');
    }
    const adminCount = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM user_profiles WHERE role='admin'").first<{ count: number }>();
    if (Number(adminCount?.count ?? 0) !== 0) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    const body: any = await c.req.json().catch(() => null);
    const username = usernameOf(body?.username);
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    if (!username || displayName.length < 2 || displayName.length > 40) {
      return fail(c, 400, 'VALIDATION_ERROR', 'Provide a valid username and display name.');
    }
    try {
      const uid = crypto.randomUUID(), identityId = crypto.randomUUID();
      const results = await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO user_profiles (id,identity_subject,display_name,username,account_status,role) VALUES (?,?,?,?, 'active','admin')")
          .bind(uid, 'closed-admin:' + crypto.randomUUID(), displayName, username),
        c.env.DB.prepare("INSERT INTO auth_identities (id,user_id,provider,provider_subject) SELECT ?,id,'email',? FROM user_profiles WHERE id=?")
          .bind(identityId, username, uid),
      ]);
      if (Number(results[0]?.meta?.changes ?? 0) !== 1) return fail(c, 409, 'ADMIN_ALREADY_EXISTS', 'Administrator setup is no longer available.');
      return ok(c, { created: true, username }, 201);
    } catch {
      return fail(c, 409, 'ADMIN_SETUP_FAILED', 'Administrator setup could not be completed.');
    }
  });

  app.get('/api/v1/admin/accounts', async (c: any) => {
    noStore(c);
    const admin = await currentAdmin(c);
    if (!admin) return fail(c, 404, 'NOT_FOUND', 'Not found.');
    try {
      const [accounts, count] = await Promise.all([
        c.env.DB.prepare("SELECT id,username,display_name AS displayName,account_status AS status,created_at AS createdAt FROM user_profiles WHERE role='user' ORDER BY created_at ASC").all(),
        c.env.DB.prepare("SELECT COUNT(*) AS count FROM user_profiles WHERE role='user'").first<{ count: number }>(),
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
    if (!username || displayName.length < 2 || displayName.length > 40 || !passwordOf(body?.password)) {
      return fail(c, 400, 'VALIDATION_ERROR', 'Provide a valid username, display name, and password of at least 12 characters.');
    }
    try {
      const uid = crypto.randomUUID(), identityId = crypto.randomUUID();
      const passwordHash = await hashPassword(body.password);
      const results = await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO user_profiles (id,identity_subject,display_name,username,account_status,role) SELECT ?,?,?,?,'active','user' WHERE (SELECT COUNT(*) FROM user_profiles WHERE role='user') < 15")
          .bind(uid, 'closed-user:' + crypto.randomUUID(), displayName, username),
        c.env.DB.prepare("INSERT INTO auth_identities (id,user_id,provider,provider_subject) SELECT ?,id,'email',? FROM user_profiles WHERE id=?")
          .bind(identityId, username, uid),
        c.env.DB.prepare('INSERT INTO password_credentials (auth_identity_id,password_hash) SELECT ?,? FROM auth_identities WHERE id=?')
          .bind(identityId, passwordHash, identityId),
      ]);
      if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
        return fail(c, 409, 'ACCOUNT_LIMIT_REACHED', 'All 15 standard accounts have already been allocated.');
      }
      return ok(c, { created: true, account: { id: uid, username, displayName, status: 'active' } }, 201);
    } catch {
      return fail(c, 409, 'ACCOUNT_CREATE_FAILED', 'The account could not be created. Check that its username is unique.');
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
    if (!passwordOf(body?.password)) return fail(c, 400, 'VALIDATION_ERROR', 'Password must contain at least 12 characters.');
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
