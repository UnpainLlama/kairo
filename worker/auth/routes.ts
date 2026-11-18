import { Hono } from 'hono';
import { normalizeAccessEmail } from './cloudflareAccess';
import { verifyPassword } from './password';
import { createSession, sessionCookie } from './session';
import { registerYouTubeAuthRoutes } from './youtube';

const WINDOW = 900000;
const ADMIN_FAILURE_WINDOW = 60 * 60 * 1000;
const enc = new TextEncoder();
const ok = (c:any,data:any,status=200)=>c.json({success:true,data,meta:{requestId:c.get('requestId')}},status);
const fail = (c:any,status:number,code:string,message:string)=>c.json({success:false,error:{code,message},meta:{requestId:c.get('requestId')}},status);
const originOk = (c:any) => {
 const expected = new URL(c.req.url).origin;
 const origin = c.req.header('Origin');
 if (origin) return origin === expected;
 const referer = c.req.header('Referer');
 if (!referer) return false;
 try { return new URL(referer).origin === expected; } catch { return false; }
};
const DUMMY_PASSWORD_HASH = 'pbkdf2-sha256$v=1$i=100000$ejnB5tT4AlueZ6EMPY9KIQ$3UdaF6Gf1pQXNBO54EBkav2TlbqJ6eZMybPDsGwEkO4';
const usernameOf=(v:unknown):string|null=>{if(typeof v!=='string')return null;const s=v.trim();return s.length>=3&&s.length<=64&&/^[A-Za-z0-9._-]+$/.test(s)?s:null};
async function sha(value:string){const d=await crypto.subtle.digest('SHA-256',enc.encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function permit(db:D1Database,action:string,ip:string,identity:string,limit:number){
 const key=await sha(action+':'+ip+':'+identity),now=Date.now();
 const row=await db.prepare(`INSERT INTO auth_rate_limits(bucket_key,window_started_at,attempts) VALUES(?,?,1)
 ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN window_started_at<=? THEN 1 ELSE attempts+1 END,
 window_started_at=CASE WHEN window_started_at<=? THEN ? ELSE window_started_at END RETURNING attempts`)
 .bind(key,now,now-WINDOW,now-WINDOW,now).first<{attempts:number}>();
 return Number(row?.attempts??limit+1)<=limit;
}
const ip=(c:any)=>c.req.header('CF-Connecting-IP')??'unknown';
const noStore=(c:any)=>c.header('Cache-Control','no-store');
const logAuthFailure=(c:any,event:string,error:unknown)=>console.error(JSON.stringify({event,requestId:c.get('requestId'),message:error instanceof Error?error.message:'unknown'}));

async function adminLoginLocked(db:D1Database):Promise<boolean>{
 const row=await db.prepare('SELECT locked_at AS lockedAt FROM admin_login_security WHERE singleton_id=1')
  .first<{lockedAt:number|null}>();
 return row?.lockedAt!==null&&row?.lockedAt!==undefined;
}

async function recordAdminLoginFailure(db:D1Database,now=Date.now()):Promise<boolean>{
 const row=await db.prepare(`INSERT INTO admin_login_security
   (singleton_id,failed_attempts,window_started_at,locked_at,updated_at)
   VALUES (1,1,?,NULL,?)
   ON CONFLICT(singleton_id) DO UPDATE SET
     failed_attempts=CASE WHEN admin_login_security.window_started_at<=? THEN 1
       ELSE MIN(5,admin_login_security.failed_attempts+1) END,
     window_started_at=CASE WHEN admin_login_security.window_started_at<=? THEN ?
       ELSE admin_login_security.window_started_at END,
     locked_at=CASE WHEN admin_login_security.window_started_at<=? THEN NULL
       WHEN admin_login_security.failed_attempts+1>=5 THEN ? ELSE admin_login_security.locked_at END,
     updated_at=?
   WHERE admin_login_security.locked_at IS NULL
   RETURNING failed_attempts AS failedAttempts,locked_at AS lockedAt`)
   .bind(now,now,now-ADMIN_FAILURE_WINDOW,now-ADMIN_FAILURE_WINDOW,now,now-ADMIN_FAILURE_WINDOW,now,now)
   .first<{failedAttempts:number;lockedAt:number|null}>();
 if(row && row.lockedAt!==null){
  // The lock must terminate already-issued console sessions too, not just new logins.
  await db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM user_profiles WHERE role='admin')").run();
  return true;
 }
 return adminLoginLocked(db);
}

async function resetAdminLoginFailures(db:D1Database,now=Date.now()):Promise<void>{
 await db.prepare(`UPDATE admin_login_security
   SET failed_attempts=0,window_started_at=?,locked_at=NULL,updated_at=?
   WHERE singleton_id=1`).bind(now,now).run();
}

export function registerAuthRoutes(app:Hono<any>){
 // Public registration and Google sign-in are intentionally not registered.
 // The single administrator is provisioned through the one-time bootstrap flow.

 app.post('/api/v1/auth/login',async(c:any)=>{
  noStore(c);
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const username=usernameOf(b?.username);
  const password=typeof b?.password==='string'?b.password:'';
  if(!username||typeof b?.password!=='string'||enc.encode(password).length>1024)return fail(c,400,'VALIDATION_ERROR','Enter a valid username and password.');
  try{
   if(!await permit(c.env.DB,'login-ip',ip(c),'global',30))return fail(c,429,'RATE_LIMITED','Too many sign-in attempts. Try again in 15 minutes.');
   const row=await c.env.DB.prepare(`SELECT p.id userId,p.account_status accountStatus,p.role,
      i.id identityId,pc.password_hash passwordHash,p.access_email accessEmail
    FROM user_profiles p
    LEFT JOIN auth_identities i ON i.user_id=p.id AND i.provider='email'
    LEFT JOIN password_credentials pc ON pc.auth_identity_id=i.id
    WHERE p.username=? COLLATE NOCASE LIMIT 1`).bind(username)
    .first() as {userId:string;accountStatus:string;role:string;identityId:string|null;passwordHash:string|null;accessEmail:string|null}|null;
   const accessEmail=normalizeAccessEmail(c.get('accessEmail'));
   const accessEnforced=c.env.ACCESS_ENFORCED==='true';
   if(!row||row.accountStatus!=='active'||!row.passwordHash||
      (accessEnforced&&(!accessEmail||row.accessEmail?.toLowerCase()!==accessEmail))) {
    // Keep unknown, suspended, and wrong-Access-identity paths close to a real password check.
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return fail(c,401,'INVALID_CREDENTIALS','Username or password is incorrect.');
   }

   if(row.role==='admin'){
    if(await adminLoginLocked(c.env.DB))return fail(c,423,'ADMIN_ACCOUNT_LOCKED','Administrator sign-in is locked. Contact the site operator to restore access.');
    const valid=await verifyPassword(password,row.passwordHash);
    if(!valid){
     const locked=await recordAdminLoginFailure(c.env.DB);
     return locked
      ?fail(c,423,'ADMIN_ACCOUNT_LOCKED','Five failed administrator sign-in attempts within one hour. Access is locked until the operator unlocks it in Cloudflare.')
      :fail(c,401,'INVALID_CREDENTIALS','Username or password is incorrect.');
    }
    await resetAdminLoginFailures(c.env.DB);
   }else{
    if(!await permit(c.env.DB,'login',ip(c),username.toLowerCase(),8))return fail(c,429,'RATE_LIMITED','Too many sign-in attempts. Try again in 15 minutes.');
    if(!await verifyPassword(password,row.passwordHash))return fail(c,401,'INVALID_CREDENTIALS','Username or password is incorrect.');
   }

   const ttlSeconds=row.role==='admin'?8*60*60:undefined;
   const session=await createSession(c.env.DB,row.userId,{
    userAgent:c.req.header('User-Agent')??undefined,
    ipPrefix:ip(c),
    ttlSeconds,
    accessEmail:accessEnforced?accessEmail:null,
   });
   c.header('Set-Cookie',sessionCookie(session.token,new URL(c.req.url).protocol==='https:',session.ttlSeconds));
   if(row.identityId)await c.env.DB.prepare('UPDATE auth_identities SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(row.identityId).run();
   return ok(c,{signedIn:true,administrator:row.role==='admin',expiresAt:session.expiresAt});
  }catch(error){logAuthFailure(c,'account_login_failed',error);return fail(c,503,'AUTH_UNAVAILABLE','Sign-in is temporarily unavailable. Please try again.')}
 });
 registerYouTubeAuthRoutes(app);
}
