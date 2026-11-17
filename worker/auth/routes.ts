import { Hono } from 'hono';
import { verifyPassword } from './password';
import { createSession, sessionCookie } from './session';
import { registerYouTubeAuthRoutes } from './youtube';

const WINDOW = 900000;
const enc = new TextEncoder();
const ok = (c:any,data:any,status=200)=>c.json({success:true,data,meta:{requestId:c.get('requestId')}},status);
const fail = (c:any,status:number,code:string,message:string)=>c.json({success:false,error:{code,message},meta:{requestId:c.get('requestId')}},status);
const originOk = (c:any)=>!c.req.header('Origin')||c.req.header('Origin')===new URL(c.req.url).origin;
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
const logAuthFailure=(c:any,event:string,error:unknown)=>console.error(JSON.stringify({event,requestId:c.get('requestId'),message:error instanceof Error?error.message:'unknown'}));

export function registerAuthRoutes(app:Hono<any>){
 // Public registration and Google sign-in are intentionally not registered.
 // Accounts are provisioned by an authenticated administrator only.
 app.post('/api/v1/auth/login',async(c:any)=>{
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const username=usernameOf(b.username);
  if(!username||typeof b.password!=='string'||enc.encode(b.password).length>1024)return fail(c,400,'VALIDATION_ERROR','Enter a valid username and password.');
  try{
   if(!await permit(c.env.DB,'login',ip(c),username.toLowerCase(),8))return fail(c,429,'RATE_LIMITED','Too many sign-in attempts. Try again in 15 minutes.');
   const row=await c.env.DB.prepare(`SELECT p.id userId,p.account_status accountStatus,i.id identityId,pc.password_hash passwordHash
    FROM user_profiles p JOIN auth_identities i ON i.user_id=p.id AND i.provider='email'
    JOIN password_credentials pc ON pc.auth_identity_id=i.id
    WHERE p.username=? COLLATE NOCASE LIMIT 1`).bind(username)
    .first() as {userId:string;accountStatus:string;identityId:string;passwordHash:string}|null;
   if(!row||row.accountStatus!=='active'||!await verifyPassword(b.password,row.passwordHash))return fail(c,401,'INVALID_CREDENTIALS','Username or password is incorrect.');
   const session=await createSession(c.env.DB,row.userId,{userAgent:c.req.header('User-Agent')??undefined,ipPrefix:ip(c)});
   c.header('Set-Cookie',sessionCookie(session.token,new URL(c.req.url).protocol==='https:'));
   await c.env.DB.prepare('UPDATE auth_identities SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(row.identityId).run();
   return ok(c,{signedIn:true,expiresAt:session.expiresAt});
  }catch(error){logAuthFailure(c,'account_login_failed',error);return fail(c,503,'AUTH_UNAVAILABLE','Sign-in is temporarily unavailable. Please try again.')}
 });
 registerYouTubeAuthRoutes(app);
}
