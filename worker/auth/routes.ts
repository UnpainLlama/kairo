import { Hono } from 'hono';
import { hashPassword, verifyPassword } from './password';
import { createOpaqueToken, createSession, hashToken, sessionCookie } from './session';

const VERIFY_TTL = 86400;
const WINDOW = 900000;
const enc = new TextEncoder();
const ok = (c:any,data:any,status=200)=>c.json({success:true,data,meta:{requestId:c.get('requestId')}},status);
const fail = (c:any,status:number,code:string,message:string)=>c.json({success:false,error:{code,message},meta:{requestId:c.get('requestId')}},status);
const originOk = (c:any)=>!c.req.header('Origin')||c.req.header('Origin')===new URL(c.req.url).origin;
const emailOf = (v:unknown):string|null=>{if(typeof v!=='string')return null;const s=v.trim().toLowerCase();return s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:null};
const passwordOk=(v:unknown):v is string=>typeof v==='string'&&Array.from(v).length>=12&&enc.encode(v).length<=1024;
const escape=(s:string)=>s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
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
const configured=(c:any)=>Boolean(c.env.RESEND_API_KEY&&c.env.AUTH_EMAIL_FROM);
async function sendMail(c:any,email:string,name:string,token:string){
 if(!configured(c))return false;
 const base=c.env.APP_BASE_URL||new URL(c.req.url).origin,link=new URL('/verify-email',base);link.searchParams.set('token',token);
 const safeName=escape(name),safeLink=escape(link.toString());
 try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+c.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({
 from:c.env.AUTH_EMAIL_FROM,to:[email],subject:'Verify your Kairo account',
 html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17171b"><h1>Welcome to Kairo, ${safeName}</h1><p>Confirm your email address to activate your account.</p><p><a href="${safeLink}" style="display:inline-block;padding:12px 20px;background:#7654dc;color:#fff;text-decoration:none;border-radius:8px">Verify email</a></p><p>This link expires in 24 hours and can only be used once.</p><p>If you did not create a Kairo account, ignore this message.</p></div>`,
 text:`Welcome to Kairo, ${name}. Verify your email: ${link.toString()} (expires in 24 hours)`
 })});return r.ok}catch{return false}
}
export function registerAuthRoutes(app:Hono<any>){
 app.post('/api/v1/auth/register',async(c:any)=>{
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  if(!configured(c))return fail(c,503,'EMAIL_NOT_CONFIGURED','Registration is unavailable until email delivery is configured.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const email=emailOf(b.email),name=typeof b.displayName==='string'?b.displayName.trim():'';
  if(!email||name.length<2||name.length>40||!passwordOk(b.password))return fail(c,400,'VALIDATION_ERROR','Enter a valid email, display name (2–40 characters), and password (at least 12 characters).');
  try{
   if(!await permit(c.env.DB,'register',ip(c),email,5))return fail(c,429,'RATE_LIMITED','Too many registration attempts. Try again in 15 minutes.');
   const exists=await c.env.DB.prepare('SELECT id FROM user_profiles WHERE email=? COLLATE NOCASE LIMIT 1').bind(email).first();
   if(exists)return ok(c,{message:'If this address can be registered, a verification email will be sent.'},202);
   const uid=crypto.randomUUID(),iid=crypto.randomUUID(),token=createOpaqueToken(),hash=await hashPassword(b.password);
   await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO user_profiles(id,identity_subject,display_name,email,account_status,role) VALUES(?,?,?,?,'active','user')").bind(uid,'email:'+crypto.randomUUID(),name,email),
    c.env.DB.prepare("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES(?,?,'email',?)").bind(iid,uid,email),
    c.env.DB.prepare('INSERT INTO password_credentials(auth_identity_id,password_hash) VALUES(?,?)').bind(iid,hash),
    c.env.DB.prepare('INSERT INTO email_verification_tokens(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),uid,await hashToken(token),Date.now()+VERIFY_TTL*1000)
   ]);
   if(!await sendMail(c,email,name,token))return fail(c,503,'EMAIL_DELIVERY_FAILED','Your account was created, but the verification email could not be sent. Please use resend verification after email delivery is available.');
   return ok(c,{message:'Check your email for a verification link. You can sign in after verifying your address.'},201);
  }catch{return fail(c,503,'REGISTRATION_UNAVAILABLE','Could not complete registration. Please try again later.')}
 });
 app.post('/api/v1/auth/login',async(c:any)=>{
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const email=emailOf(b.email);if(!email||typeof b.password!=='string'||enc.encode(b.password).length>1024)return fail(c,400,'VALIDATION_ERROR','Enter a valid email address and password.');
  try{
   if(!await permit(c.env.DB,'login',ip(c),email,8))return fail(c,429,'RATE_LIMITED','Too many sign-in attempts. Try again in 15 minutes.');
   const row=await c.env.DB.prepare(`SELECT p.id userId,p.account_status accountStatus,p.email_verified_at emailVerifiedAt,i.id identityId,pc.password_hash passwordHash
    FROM user_profiles p JOIN auth_identities i ON i.user_id=p.id AND i.provider='email'
    JOIN password_credentials pc ON pc.auth_identity_id=i.id WHERE p.email=? COLLATE NOCASE LIMIT 1`).bind(email)
    .first<{userId:string;accountStatus:string;emailVerifiedAt:string|null;identityId:string;passwordHash:string}>();
   if(!row||row.accountStatus!=='active'||!await verifyPassword(b.password,row.passwordHash))return fail(c,401,'INVALID_CREDENTIALS','Email or password is incorrect.');
   if(!row.emailVerifiedAt)return fail(c,403,'EMAIL_NOT_VERIFIED','Verify your email address before signing in.');
   const session=await createSession(c.env.DB,row.userId,{userAgent:c.req.header('User-Agent')??undefined,ipPrefix:ip(c)});
   c.header('Set-Cookie',sessionCookie(session.token,new URL(c.req.url).protocol==='https:'));
   await c.env.DB.prepare('UPDATE auth_identities SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(row.identityId).run();
   return ok(c,{signedIn:true,expiresAt:session.expiresAt});
  }catch{return fail(c,503,'AUTH_UNAVAILABLE','Sign-in is temporarily unavailable. Please try again.')}
 });
 app.post('/api/v1/auth/verify-email',async(c:any)=>{
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const token=typeof b.token==='string'?b.token:'';if(!/^[A-Za-z0-9_-]{43}$/.test(token))return fail(c,400,'INVALID_TOKEN','This verification link is invalid or expired.');
  try{
   if(!await permit(c.env.DB,'verify',ip(c),await hashToken(token),10))return fail(c,429,'RATE_LIMITED','Too many verification attempts. Try again later.');
   const row=await c.env.DB.prepare(`UPDATE email_verification_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING user_id userId`).bind(await hashToken(token),Date.now()).first<{userId:string}>();
   if(!row)return fail(c,400,'INVALID_TOKEN','This verification link is invalid, expired, or already used.');
   await c.env.DB.prepare("UPDATE user_profiles SET email_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND account_status='active'").bind(row.userId).run();
   return ok(c,{verified:true,message:'Your email is verified. You can now sign in.'});
  }catch{return fail(c,503,'VERIFICATION_UNAVAILABLE','Email verification is temporarily unavailable. Please try again.')}
 });
 app.post('/api/v1/auth/resend-verification',async(c:any)=>{
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  if(!configured(c))return fail(c,503,'EMAIL_NOT_CONFIGURED','Email delivery is not configured.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const email=emailOf(b.email);if(!email)return fail(c,400,'VALIDATION_ERROR','Enter a valid email address.');
  try{
   if(!await permit(c.env.DB,'resend',ip(c),email,3))return fail(c,429,'RATE_LIMITED','Too many requests. Try again in 15 minutes.');
   const user=await c.env.DB.prepare("SELECT id,display_name displayName FROM user_profiles WHERE email=? COLLATE NOCASE AND email_verified_at IS NULL AND account_status='active' LIMIT 1").bind(email).first<{id:string;displayName:string}>();
   if(user){const token=createOpaqueToken();await c.env.DB.batch([
    c.env.DB.prepare("UPDATE email_verification_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE user_id=? AND consumed_at IS NULL").bind(user.id),
    c.env.DB.prepare('INSERT INTO email_verification_tokens(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),user.id,await hashToken(token),Date.now()+VERIFY_TTL*1000)
   ]);await sendMail(c,email,user.displayName,token)}
   return ok(c,{message:'If an unverified account exists for that address, a new verification email will be sent.'});
  }catch{return fail(c,503,'VERIFICATION_UNAVAILABLE','Could not process the request. Please try again later.')}
 });
}
