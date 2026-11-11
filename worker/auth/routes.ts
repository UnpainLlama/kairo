import { Hono } from 'hono';
import { hashPassword, verifyPassword } from './password';
import { createSession, sessionCookie } from './session';
import { registerGoogleAuthRoutes } from './google';

const WINDOW = 900000;
const enc = new TextEncoder();
const ok = (c:any,data:any,status=200)=>c.json({success:true,data,meta:{requestId:c.get('requestId')}},status);
const fail = (c:any,status:number,code:string,message:string)=>c.json({success:false,error:{code,message},meta:{requestId:c.get('requestId')}},status);
const originOk = (c:any)=>!c.req.header('Origin')||c.req.header('Origin')===new URL(c.req.url).origin;
const emailOf = (v:unknown):string|null=>{if(typeof v!=='string')return null;const s=v.trim().toLowerCase();return s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:null};
const passwordOk=(v:unknown):v is string=>typeof v==='string'&&Array.from(v).length>=12&&enc.encode(v).length<=1024;
async function sha(value:string){const d=await crypto.subtle.digest('SHA-256',enc.encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function permit(db:D1Database,action:string,ip:string,identity:string,limit:number){
 const key=await sha(action+':'+ip+':'+identity),now=Date.now();
 const row=await db.prepare(`INSERT INTO auth_rate_limits(bucket_key,window_started_at,attempts) VALUES(?,?,1)
 ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN window_started_at<=? THEN 1 ELSE attempts+1 END,
 window_started_at=CASE WHEN window_started_at<=? THEN ? ELSE window_started_at END RETURNING attempts`)
 .bind(key,now,now-WINDOW,now-WINDOW,now).first<{attempts:number}>();
 return Number(row?.attempts??limit+1)<=limit;
  registerGoogleAuthRoutes(app);
  registerGoogleAuthRoutes(app);
}
const ip=(c:any)=>c.req.header('CF-Connecting-IP')??'unknown';

export function registerAuthRoutes(app:Hono<any>){
 app.post('/api/v1/auth/register',async(c:any)=>{
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const email=emailOf(b.email),name=typeof b.displayName==='string'?b.displayName.trim():'';
  if(!email||name.length<2||name.length>40||!passwordOk(b.password))return fail(c,400,'VALIDATION_ERROR','Enter a valid email, display name (2–40 characters), and password (at least 12 characters).');
  try{
   if(!await permit(c.env.DB,'register',ip(c),email,5))return fail(c,429,'RATE_LIMITED','Too many registration attempts. Try again in 15 minutes.');
   const exists=await c.env.DB.prepare('SELECT id FROM user_profiles WHERE email=? COLLATE NOCASE LIMIT 1').bind(email).first();
   if(exists)return fail(c,409,'EMAIL_ALREADY_REGISTERED','An account with this email already exists. Sign in instead.');
   const uid=crypto.randomUUID(),iid=crypto.randomUUID(),hash=await hashPassword(b.password);
   await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO user_profiles(id,identity_subject,display_name,email,account_status,role) VALUES(?,?,?,?,'active','user')").bind(uid,'email:'+crypto.randomUUID(),name,email),
    c.env.DB.prepare("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES(?,?,'email',?)").bind(iid,uid,email),
    c.env.DB.prepare('INSERT INTO password_credentials(auth_identity_id,password_hash) VALUES(?,?)').bind(iid,hash)
   ]);
   const session=await createSession(c.env.DB,uid,{userAgent:c.req.header('User-Agent')??undefined,ipPrefix:ip(c)});
   c.header('Set-Cookie',sessionCookie(session.token,new URL(c.req.url).protocol==='https:'));
   return ok(c,{signedIn:true,message:'Your Kairo account is ready.',expiresAt:session.expiresAt},201);
  }catch{return fail(c,503,'REGISTRATION_UNAVAILABLE','Could not complete registration. Please try again later.')}
 });
 app.post('/api/v1/auth/login',async(c:any)=>{
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const email=emailOf(b.email);if(!email||typeof b.password!=='string'||enc.encode(b.password).length>1024)return fail(c,400,'VALIDATION_ERROR','Enter a valid email address and password.');
  try{
   if(!await permit(c.env.DB,'login',ip(c),email,8))return fail(c,429,'RATE_LIMITED','Too many sign-in attempts. Try again in 15 minutes.');
   const row=await c.env.DB.prepare(`SELECT p.id userId,p.account_status accountStatus,i.id identityId,pc.password_hash passwordHash
    FROM user_profiles p JOIN auth_identities i ON i.user_id=p.id AND i.provider='email'
    JOIN password_credentials pc ON pc.auth_identity_id=i.id WHERE p.email=? COLLATE NOCASE LIMIT 1`).bind(email)
    .first<{userId:string;accountStatus:string;identityId:string;passwordHash:string}>();
   if(!row||row.accountStatus!=='active'||!await verifyPassword(b.password,row.passwordHash))return fail(c,401,'INVALID_CREDENTIALS','Email or password is incorrect.');
   const session=await createSession(c.env.DB,row.userId,{userAgent:c.req.header('User-Agent')??undefined,ipPrefix:ip(c)});
   c.header('Set-Cookie',sessionCookie(session.token,new URL(c.req.url).protocol==='https:'));
   await c.env.DB.prepare('UPDATE auth_identities SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(row.identityId).run();
   return ok(c,{signedIn:true,expiresAt:session.expiresAt});
  }catch{return fail(c,503,'AUTH_UNAVAILABLE','Sign-in is temporarily unavailable. Please try again.')}
 });
  registerGoogleAuthRoutes(app);
}
