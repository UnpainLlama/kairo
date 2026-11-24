import {Hono} from 'hono';
import {registerYouTubeAuthRoutes} from './youtube';
import {getRequestUser} from './requestUser';
import {hashPassword,isNewPasswordValid,isPasswordDifferentFromUsername,needsRehash,verifyPassword} from './password';
import {createSession,sessionCookie} from './session';
import {clearRateLimit,isRateLimited,recordRateLimitFailure} from './rateLimit';
import {normalizeUsername} from './username';

const DUMMY_PASSWORD_HASH='pbkdf2-sha256$v=2$i=100000$WlpaWlpaWlpaWlpaWlpaWg$XsWo9UbujN3j4roHa387r20-Q0KZp6eMzYvLqCTkL2c';
const LOGIN_WINDOW_MS=15*60*1000;
const LOGIN_PAIR_LIMIT=30;
const LOGIN_IP_LIMIT=120;
const ok=(c:any,data:unknown,status=200)=>c.json({success:true,data,meta:{requestId:c.get('requestId')}},status);
const fail=(c:any,status:number,code:string,message:string)=>c.json({success:false,error:{code,message},meta:{requestId:c.get('requestId')}},status);
function loginFailure(c:any){return fail(c,401,'INVALID_CREDENTIALS','Username or password is incorrect.');}

export function registerAuthRoutes(app:Hono<any>){
  app.post('/api/v1/auth/login',async(c:any)=>{
    c.header('Cache-Control','no-store');
    const body:unknown=await c.req.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body))return fail(c,400,'VALIDATION_ERROR','Provide a valid username and password.');
    const value=body as Record<string,unknown>;
    const username=normalizeUsername(value.username);
    const password=typeof value.password==='string'?value.password:'';
    const ip=c.req.header('CF-Connecting-IP')??'unknown';
    if(!username||typeof value.password!=='string'||new TextEncoder().encode(password).length>1024){
      try{await verifyPassword('invalid-login-attempt',DUMMY_PASSWORD_HASH);}catch{/* generic failure */}
      return loginFailure(c);
    }
    const pairKey=ip+':'+username;
    try{
      const [pairLimited,ipLimited]=await Promise.all([
        isRateLimited(c.env.DB,pairKey,'login-ip-username',LOGIN_PAIR_LIMIT,LOGIN_WINDOW_MS),
        isRateLimited(c.env.DB,ip,'login-ip',LOGIN_IP_LIMIT,LOGIN_WINDOW_MS),
      ]);
      if(pairLimited||ipLimited){c.header('Retry-After','60');return fail(c,429,'RATE_LIMITED','Too many unsuccessful sign-in attempts. Try again later.');}
      const account=await c.env.DB.prepare(`SELECT p.id,p.role,p.account_status AS accountStatus,p.username,
          uc.password_hash AS passwordHash,uc.must_change_password AS mustChangePassword
        FROM user_profiles p LEFT JOIN user_credentials uc ON uc.user_id=p.id
        WHERE p.username=? COLLATE NOCASE LIMIT 1`).bind(username).first<{
          id:string;role:'user'|'admin';accountStatus:string;username:string;
          passwordHash:string|null;mustChangePassword:number|null;
        }>();
      const valid=await verifyPassword(password,account?.passwordHash??DUMMY_PASSWORD_HASH);
      if(!account||!account.passwordHash||!valid){
        await Promise.all([
          recordRateLimitFailure(c.env.DB,pairKey,'login-ip-username',LOGIN_WINDOW_MS),
          recordRateLimitFailure(c.env.DB,ip,'login-ip',LOGIN_WINDOW_MS),
        ]);
        return loginFailure(c);
      }
      await clearRateLimit(c.env.DB,pairKey,'login-ip-username');
      if(account.accountStatus!=='active')return fail(c,403,'ACCOUNT_SUSPENDED','This account is suspended. Contact the administrator.');
      if(needsRehash(account.passwordHash)){
        const upgraded=await hashPassword(password);
        await c.env.DB.prepare('UPDATE user_credentials SET password_hash=?,password_changed_at=CURRENT_TIMESTAMP WHERE user_id=? AND password_hash=?')
          .bind(upgraded,account.id,account.passwordHash).run();
      }
      const ttlSeconds=account.role==='admin'?8*60*60:30*24*60*60;
      const session=await createSession(c.env.DB,account.id,{ttlSeconds});
      c.header('Set-Cookie',sessionCookie(session.token,new URL(c.req.url).protocol==='https:',session.ttlSeconds));
      return ok(c,{signedIn:true,mustChangePassword:Number(account.mustChangePassword??0)===1});
    }catch{
      // Authentication request bodies and credential material must never be logged.
      return fail(c,503,'AUTH_UNAVAILABLE','Sign-in is temporarily unavailable.');
    }
  });

  app.post('/api/v1/me/password',async(c:any)=>{
    c.header('Cache-Control','no-store');
    const user=await getRequestUser(c);
    if(!user)return fail(c,401,'AUTH_REQUIRED','A Kairo account session is required to change the password.');
    const body:unknown=await c.req.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body))return fail(c,400,'VALIDATION_ERROR','Provide the current and new password.');
    const value=body as Record<string,unknown>;
    const currentPassword=typeof value.currentPassword==='string'?value.currentPassword:'';
    const newPassword=value.newPassword;
    if(!isNewPasswordValid(newPassword)||!isPasswordDifferentFromUsername(newPassword,user.username))
      return fail(c,400,'VALIDATION_ERROR','The new password must be at least 15 characters, no more than 1024 UTF-8 bytes, and must not equal the username.');
    if(newPassword===currentPassword)return fail(c,400,'PASSWORD_UNCHANGED','Choose a password different from the current password.');
    try{
      const credential=await c.env.DB.prepare('SELECT password_hash AS passwordHash FROM user_credentials WHERE user_id=? LIMIT 1')
        .bind(user.id).first<{passwordHash:string}>();
      if(!credential||!await verifyPassword(currentPassword,credential.passwordHash))
        return fail(c,403,'CURRENT_PASSWORD_INCORRECT','The current password is incorrect.');
      const passwordHash=await hashPassword(newPassword);
      const results=await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE user_credentials SET password_hash=?,password_changed_at=CURRENT_TIMESTAMP,must_change_password=0
          WHERE user_id=? AND password_hash=?`).bind(passwordHash,user.id,credential.passwordHash),
        c.env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND id<>?
          AND EXISTS(SELECT 1 FROM user_credentials WHERE user_id=? AND password_hash=?)`)
          .bind(user.id,user.sessionId,user.id,passwordHash),
      ]);
      if(Number(results[0]?.meta?.changes??0)!==1)return fail(c,409,'PASSWORD_CHANGE_CONFLICT','The password changed in another request. Sign in again.');
      return ok(c,{passwordChanged:true,sessionsRevoked:true,mustChangePassword:false});
    }catch{return fail(c,503,'AUTH_UNAVAILABLE','The password could not be changed right now.');}
  });
  registerYouTubeAuthRoutes(app);
}
