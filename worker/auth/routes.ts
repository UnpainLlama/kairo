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
const noStore=(c:any)=>c.header('Cache-Control','no-store');
function sameText(a:string,b:string):boolean{
 if(a.length!==b.length)return false;
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}
async function otpDigest(c:any,challengeId:string,code:string):Promise<string>{
 const pepper=c.env.ADMIN_OTP_PEPPER;
 if(typeof pepper!=='string'||pepper.length<32)throw new Error('admin_otp_pepper_unconfigured');
 const key=await crypto.subtle.importKey('raw',enc.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await crypto.subtle.sign('HMAC',key,enc.encode(challengeId+':'+code));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function createOtpCode():string{
 const range=0x1_0000_0000,modulus=100_000_000,limit=Math.floor(range/modulus)*modulus;
 const values=new Uint32Array(1);let value=0;
 do{crypto.getRandomValues(values);value=values[0]}while(value>=limit);
 return String(value%modulus).padStart(8,'0');
}
async function sendAdminLoginCode(c:any,code:string):Promise<void>{
 const apiKey=c.env.RESEND_API_KEY;
 const recipient=c.env.ADMIN_EMAIL;
 const sender=c.env.AUTH_EMAIL_FROM||'Kairo Security <onboarding@resend.dev>';
 if(typeof apiKey!=='string'||apiKey.length<12||typeof recipient!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)){
  throw new Error('admin_email_delivery_unconfigured');
 }
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',
  headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({
   from:sender,to:[recipient],subject:'Your Kairo administrator sign-in code',
   text:'Your Kairo administrator sign-in code is '+code+'. It expires in five minutes and can only be used once. If you did not request this code, ignore this message.'
  })
 });
 if(!response.ok)throw new Error('admin_email_delivery_http_'+response.status);
}

const logAuthFailure=(c:any,event:string,error:unknown)=>console.error(JSON.stringify({event,requestId:c.get('requestId'),message:error instanceof Error?error.message:'unknown'}));

export function registerAuthRoutes(app:Hono<any>){
 // Public registration and Google sign-in are intentionally not registered.
 // Accounts are provisioned by an authenticated administrator only.

 app.post('/api/v1/auth/login',async(c:any)=>{
  noStore(c);
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const username=usernameOf(b.username);
  const password=typeof b.password==='string'?b.password:'';
  if(!username||(b.password!==undefined&&typeof b.password!=='string')||enc.encode(password).length>1024)return fail(c,400,'VALIDATION_ERROR','Enter a valid username.');
  try{
   if(!await permit(c.env.DB,'login',ip(c),username.toLowerCase(),8))return fail(c,429,'RATE_LIMITED','Too many sign-in attempts. Try again in 15 minutes.');
   const row=await c.env.DB.prepare(`SELECT p.id userId,p.account_status accountStatus,p.role,i.id identityId,pc.password_hash passwordHash
    FROM user_profiles p
    LEFT JOIN auth_identities i ON i.user_id=p.id AND i.provider='email'
    LEFT JOIN password_credentials pc ON pc.auth_identity_id=i.id
    WHERE p.username=? COLLATE NOCASE LIMIT 1`).bind(username)
    .first() as {userId:string;accountStatus:string;role:string;identityId:string|null;passwordHash:string|null}|null;
   if(!row||row.accountStatus!=='active')return fail(c,401,'INVALID_CREDENTIALS','Username or password is incorrect.');
   if(row.role==='admin'){
    if(password.length>0)return fail(c,401,'ADMIN_EMAIL_CODE_REQUIRED','Administrator sign-in uses an emailed code. Leave the password blank.');
    if(typeof c.env.ADMIN_OTP_PEPPER!=='string'||c.env.ADMIN_OTP_PEPPER.length<32)return fail(c,503,'ADMIN_EMAIL_UNAVAILABLE','Administrator verification is not configured.');
    if(!await permit(c.env.DB,'admin-code-send-ip',ip(c),username.toLowerCase(),3)||
       !await permit(c.env.DB,'admin-code-send-global','global',username.toLowerCase(),3))return fail(c,429,'RATE_LIMITED','Too many code requests. Try again later.');
    const challengeId=crypto.randomUUID();
    const code=createOtpCode();
    const codeHash=await otpDigest(c,challengeId,code);
    await c.env.DB.batch([
     c.env.DB.prepare('DELETE FROM admin_login_challenges WHERE user_id=?').bind(row.userId),
     c.env.DB.prepare('INSERT INTO admin_login_challenges (id,user_id,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,0,?)')
      .bind(challengeId,row.userId,codeHash,Date.now()+300_000,Date.now()),
    ]);
    try{await sendAdminLoginCode(c,code)}catch(error){
     await c.env.DB.prepare('DELETE FROM admin_login_challenges WHERE id=?').bind(challengeId).run().catch(()=>undefined);
     logAuthFailure(c,'admin_login_code_delivery_failed',error);
     return fail(c,503,'ADMIN_EMAIL_UNAVAILABLE','The administrator verification email could not be sent. Try again later.');
    }
    return ok(c,{challengeRequired:true,challengeId,expiresInSeconds:300},202);
   }
   if(!password||!row.passwordHash||!await verifyPassword(password,row.passwordHash))return fail(c,401,'INVALID_CREDENTIALS','Username or password is incorrect.');
   const session=await createSession(c.env.DB,row.userId,{userAgent:c.req.header('User-Agent')??undefined,ipPrefix:ip(c)});
   c.header('Set-Cookie',sessionCookie(session.token,new URL(c.req.url).protocol==='https:'));
   if(row.identityId)await c.env.DB.prepare('UPDATE auth_identities SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(row.identityId).run();
   return ok(c,{signedIn:true,expiresAt:session.expiresAt});
  }catch(error){logAuthFailure(c,'account_login_failed',error);return fail(c,503,'AUTH_UNAVAILABLE','Sign-in is temporarily unavailable. Please try again.')}
 });

 app.post('/api/v1/auth/admin-code/verify',async(c:any)=>{
  noStore(c);
  if(!originOk(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
  let b:any;try{b=await c.req.json()}catch{return fail(c,400,'VALIDATION_ERROR','Provide valid JSON.')}
  const username=usernameOf(b?.username);
  const challengeId=typeof b?.challengeId==='string'?b.challengeId:'';
  const code=typeof b?.code==='string'?b.code:'';
  if(!username||!/^[0-9a-f-]{36}$/i.test(challengeId)||!/^[0-9]{8}$/.test(code))return fail(c,400,'VALIDATION_ERROR','Enter the eight-digit verification code.');
  try{
   if(!await permit(c.env.DB,'admin-code-verify',ip(c),challengeId,8))return fail(c,429,'RATE_LIMITED','Too many verification attempts. Request a new code later.');
   const challenge=await c.env.DB.prepare(`SELECT ch.user_id userId,ch.code_hash codeHash,ch.expires_at expiresAt,ch.attempts,
      p.username,p.account_status accountStatus
     FROM admin_login_challenges ch JOIN user_profiles p ON p.id=ch.user_id
     WHERE ch.id=? AND p.username=? COLLATE NOCASE AND p.role='admin' AND p.account_status='active' AND ch.consumed_at IS NULL
     LIMIT 1`).bind(challengeId,username).first() as {userId:string;codeHash:string;expiresAt:number;attempts:number}|null;
   if(!challenge||Number(challenge.expiresAt)<=Date.now()||Number(challenge.attempts)>=5)return fail(c,401,'INVALID_CODE','The verification code is invalid or expired.');
   const suppliedHash=await otpDigest(c,challengeId,code);
   if(!sameText(suppliedHash,challenge.codeHash)){
    await c.env.DB.prepare('UPDATE admin_login_challenges SET attempts=attempts+1 WHERE id=? AND consumed_at IS NULL AND attempts<5').bind(challengeId).run();
    return fail(c,401,'INVALID_CODE','The verification code is invalid or expired.');
   }
   const consumed=await c.env.DB.prepare('UPDATE admin_login_challenges SET consumed_at=? WHERE id=? AND user_id=? AND consumed_at IS NULL AND expires_at>? AND attempts<5 RETURNING user_id')
    .bind(Date.now(),challengeId,challenge.userId,Date.now()).first<{user_id:string}>();
   if(!consumed)return fail(c,401,'INVALID_CODE','The verification code is invalid or expired.');
   const session=await createSession(c.env.DB,challenge.userId,{userAgent:c.req.header('User-Agent')??undefined,ipPrefix:ip(c)});
   c.header('Set-Cookie',sessionCookie(session.token,new URL(c.req.url).protocol==='https:'));
   return ok(c,{signedIn:true,administrator:true,expiresAt:session.expiresAt});
  }catch(error){logAuthFailure(c,'admin_login_code_verify_failed',error);return fail(c,503,'AUTH_UNAVAILABLE','Administrator sign-in is temporarily unavailable.')}
 });
 registerYouTubeAuthRoutes(app);
}
