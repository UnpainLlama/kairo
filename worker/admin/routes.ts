import {getRequestUser} from '../auth/requestUser';
import {hashPassword,isPasswordDifferentFromUsername} from '../auth/password';
import {createTemporaryPassword} from '../auth/temporaryPassword';
import {validateUsername} from '../auth/username';
import {deleteStandardAccount} from '../auth/accountDeletion';
export {deleteStandardAccount};
const fail=(c:any,status:number,code:string,message:string)=>c.json({success:false,error:{code,message},meta:{requestId:c.get('requestId')}},status);
const ok=(c:any,data:unknown,status=200)=>c.json({success:true,data,meta:{requestId:c.get('requestId')}},status);
async function currentAdmin(c:any){const user=await getRequestUser(c);return user?.role==='admin'?user:null;}
function newConsolePath():string{const b=crypto.getRandomValues(new Uint8Array(32));let s='';for(const n of b)s+=String.fromCharCode(n);return '/'+btoa(s).replace(/=/g,'').replaceAll('+','-').replaceAll('/','_');}
async function ensureConsolePath(db:D1Database):Promise<string|null>{
  const now=Date.now();const e=await db.prepare('SELECT path_value AS pathValue FROM admin_console_access WHERE singleton_id=1 AND expires_at>?').bind(now).first<{pathValue:string}>();
  if(e?.pathValue)return e.pathValue;const path=newConsolePath();
  await db.prepare(`INSERT INTO admin_console_access(singleton_id,path_value,rotated_at,expires_at) VALUES(1,?,?,?)
    ON CONFLICT(singleton_id) DO UPDATE SET path_value=excluded.path_value,rotated_at=excluded.rotated_at,expires_at=excluded.expires_at
    WHERE admin_console_access.expires_at<=?`).bind(path,now,now+30*60*1000,now).run();
  const current=await db.prepare('SELECT path_value AS pathValue FROM admin_console_access WHERE singleton_id=1 AND expires_at>?').bind(now).first<{pathValue:string}>();
  return current?.pathValue??null;
}
export async function rotateAdminConsolePath(db:D1Database):Promise<void>{
  const admin=await db.prepare("SELECT id FROM user_profiles WHERE role='admin' AND account_status='active' LIMIT 1").first();if(!admin)return;
  const now=Date.now();await db.prepare(`INSERT INTO admin_console_access(singleton_id,path_value,rotated_at,expires_at) VALUES(1,?,?,?)
    ON CONFLICT(singleton_id) DO UPDATE SET path_value=excluded.path_value,rotated_at=excluded.rotated_at,expires_at=excluded.expires_at
    WHERE admin_console_access.expires_at<=?`).bind(newConsolePath(),now,now+30*60*1000,now).run();
}
function noStore(c:any){c.header('Cache-Control','no-store');}
function isUsernameConflict(error:unknown):boolean{const m=error instanceof Error?error.message:String(error);return m.toLowerCase().includes('unique constraint failed: user_profiles.username')||m.includes('idx_user_profiles_username');}
function isAccountLimitError(error:unknown):boolean{const m=error instanceof Error?error.message:String(error);return m.includes('standard_account_limit_reached');}

export function registerAdminRoutes(app:any){
  app.get('/api/v1/admin/console-path',async(c:any)=>{
    noStore(c);if(!await currentAdmin(c))return fail(c,404,'NOT_FOUND','Not found.');
    try{const path=await ensureConsolePath(c.env.DB);if(!path)return fail(c,503,'ADMIN_CONSOLE_UNAVAILABLE','The administrator console is temporarily unavailable.');return ok(c,{path,expiresInSeconds:1800});}
    catch{return fail(c,503,'ADMIN_CONSOLE_UNAVAILABLE','The administrator console is temporarily unavailable.');}
  });
  app.get('/api/v1/admin/accounts',async(c:any)=>{
    noStore(c);if(!await currentAdmin(c))return fail(c,404,'NOT_FOUND','Not found.');
    try{
      const [accounts,count]=await Promise.all([
        c.env.DB.prepare(`SELECT p.id,p.username,p.display_name AS displayName,p.account_status AS status,p.created_at AS createdAt,
          CASE WHEN uc.user_id IS NULL THEN 0 ELSE 1 END AS credentialsConfigured,COALESCE(uc.must_change_password,1) AS mustChangePassword
          FROM user_profiles p LEFT JOIN user_credentials uc ON uc.user_id=p.id WHERE p.role='user' AND p.account_status IN ('active','suspended') ORDER BY p.created_at ASC`).all(),
        c.env.DB.prepare("SELECT COUNT(*) AS count FROM user_profiles WHERE role='user' AND account_status IN ('active','suspended')").first() as Promise<{count:number}|null>,
      ]);
      return ok(c,{accounts:accounts.results??[],standardAccountCount:Number(count?.count??0),standardAccountLimit:15});
    }catch{return fail(c,503,'ADMIN_UNAVAILABLE','Account management is temporarily unavailable.');}
  });
  app.post('/api/v1/admin/accounts',async(c:any)=>{
    noStore(c);if(!await currentAdmin(c))return fail(c,404,'NOT_FOUND','Not found.');
    const body:unknown=await c.req.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body))return fail(c,400,'VALIDATION_ERROR','Provide a username and display name.');
    const value=body as Record<string,unknown>,parsed=validateUsername(value.username);
    if(!parsed.ok)return fail(c,400,'USERNAME_INVALID','Choose a valid, non-reserved username.');
    const n=typeof value.displayName==='string'?value.displayName.trim():'',displayName=n.length>=2&&n.length<=40?n:parsed.username;
    const uid=crypto.randomUUID();let temp=createTemporaryPassword();
    while(!isPasswordDifferentFromUsername(temp,parsed.username))temp=createTemporaryPassword();
    try{
      const hash=await hashPassword(temp);
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO user_profiles(id,identity_subject,display_name,username,account_status,role) VALUES(?,?,?,?,'active','user')").bind(uid,'local:'+uid,displayName,parsed.username),
        c.env.DB.prepare("INSERT INTO user_credentials(user_id,password_hash,password_changed_at,must_change_password) VALUES(?,?,CURRENT_TIMESTAMP,1)").bind(uid,hash),
      ]);
      return ok(c,{created:true,accountId:uid,username:parsed.username,temporaryPassword:temp,mustChangePassword:true},201);
    }catch(error){if(isAccountLimitError(error))return fail(c,409,'ACCOUNT_LIMIT_REACHED','All 15 standard-account places are allocated.');if(isUsernameConflict(error))return fail(c,409,'USERNAME_TAKEN','That username is already in use.');return fail(c,503,'ADMIN_UNAVAILABLE','The account could not be created.');}
  });
  // Enrol existing profile rows in place without changing their owner ID or user data.
  app.post('/api/v1/admin/accounts/:id/enroll',async(c:any)=>{
    noStore(c);if(!await currentAdmin(c))return fail(c,404,'NOT_FOUND','Not found.');
    const body:unknown=await c.req.json().catch(()=>null),parsed=body&&typeof body==='object'&&!Array.isArray(body)
      ?validateUsername((body as Record<string,unknown>).username):{ok:false as const,reason:'invalid' as const};
    if(!parsed.ok)return fail(c,400,'USERNAME_INVALID','Choose a valid, non-reserved username.');
    const id=c.req.param('id');let temp=createTemporaryPassword();
    while(!isPasswordDifferentFromUsername(temp,parsed.username))temp=createTemporaryPassword();
    try{
      const hash=await hashPassword(temp);
      const results=await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE user_profiles SET username=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='user'
          AND account_status IN ('active','suspended') AND NOT EXISTS(SELECT 1 FROM user_credentials WHERE user_id=user_profiles.id)`).bind(parsed.username,id),
        c.env.DB.prepare(`INSERT INTO user_credentials(user_id,password_hash,password_changed_at,must_change_password)
          SELECT id,?,CURRENT_TIMESTAMP,1 FROM user_profiles WHERE id=? AND role='user' AND account_status IN ('active','suspended')
          AND username=? AND NOT EXISTS(SELECT 1 FROM user_credentials WHERE user_id=user_profiles.id)`).bind(hash,id,parsed.username),
        c.env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM user_credentials WHERE user_id=? AND password_hash=?)`).bind(id,id,hash),
      ]);
      if(Number(results[0]?.meta?.changes??0)!==1||Number(results[1]?.meta?.changes??0)!==1){
        const existing=await c.env.DB.prepare("SELECT p.id,uc.user_id AS credentialUserId FROM user_profiles p LEFT JOIN user_credentials uc ON uc.user_id=p.id WHERE p.id=? AND p.role='user' AND p.account_status IN ('active','suspended')").bind(id).first() as {id:string;credentialUserId:string|null}|null;
        if(!existing)return fail(c,404,'ACCOUNT_NOT_FOUND','That standard account was not found.');
        if(existing.credentialUserId)return fail(c,409,'CREDENTIALS_ALREADY_CONFIGURED','That account already has password credentials; use the reset action.');
        return fail(c,409,'ACCOUNT_ENROLLMENT_FAILED','The account could not be enrolled.');
      }
      return ok(c,{enrolled:true,accountId:id,username:parsed.username,temporaryPassword:temp,mustChangePassword:true});
    }catch(error){if(isUsernameConflict(error))return fail(c,409,'USERNAME_TAKEN','That username is already in use.');return fail(c,503,'ADMIN_UNAVAILABLE','The account could not be enrolled.');}
  });
  app.post('/api/v1/admin/accounts/:id/password',async(c:any)=>{
    noStore(c);if(!await currentAdmin(c))return fail(c,404,'NOT_FOUND','Not found.');
    const id=c.req.param('id'),target=await c.env.DB.prepare(`SELECT p.id,p.username,uc.user_id AS credentialUserId FROM user_profiles p
      LEFT JOIN user_credentials uc ON uc.user_id=p.id WHERE p.id=? AND p.role='user' AND p.account_status IN ('active','suspended')`)
      .bind(id).first() as {id:string;username:string|null;credentialUserId:string|null}|null;
    if(!target)return fail(c,404,'ACCOUNT_NOT_FOUND','That standard account was not found.');
    if(!target.credentialUserId||!target.username)return fail(c,409,'CREDENTIALS_NOT_CONFIGURED','Enroll this existing account before resetting its password.');
    let temp=createTemporaryPassword();while(!isPasswordDifferentFromUsername(temp,target.username))temp=createTemporaryPassword();
    try{
      const hash=await hashPassword(temp);
      const results=await c.env.DB.batch([
        c.env.DB.prepare("UPDATE user_credentials SET password_hash=?,password_changed_at=CURRENT_TIMESTAMP,must_change_password=1 WHERE user_id=?").bind(hash,id),
        c.env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM user_credentials WHERE user_id=? AND password_hash=?)").bind(id,id,hash),
      ]);
      if(Number(results[0]?.meta?.changes??0)!==1)return fail(c,409,'CREDENTIALS_NOT_CONFIGURED','Enroll this existing account before resetting its password.');
      return ok(c,{reset:true,accountId:id,temporaryPassword:temp,mustChangePassword:true});
    }catch{return fail(c,503,'ADMIN_UNAVAILABLE','The password could not be reset.');}
  });
  app.patch('/api/v1/admin/accounts/:id/status',async(c:any)=>{
    noStore(c);if(!await currentAdmin(c))return fail(c,404,'NOT_FOUND','Not found.');
    const body:unknown=await c.req.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body)||((body as Record<string,unknown>).status!=='active'&&(body as Record<string,unknown>).status!=='suspended'))
      return fail(c,400,'VALIDATION_ERROR','Status must be active or suspended.');
    const status=(body as Record<string,unknown>).status as 'active'|'suspended',id=c.req.param('id');
    const results=await c.env.DB.batch([
      c.env.DB.prepare("UPDATE user_profiles SET account_status=? WHERE id=? AND role='user' AND account_status IN ('active','suspended')").bind(status,id),
      c.env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND ?='suspended' AND EXISTS(SELECT 1 FROM user_profiles WHERE id=? AND role='user' AND account_status='suspended')`).bind(id,status,id),
    ]);
    if(Number(results[0]?.meta?.changes??0)!==1)return fail(c,404,'ACCOUNT_NOT_FOUND','That standard account was not found.');
    return ok(c,{updated:true,status,sessionsRevoked:status==='suspended'});
  });
  app.delete('/api/v1/admin/accounts/:id',async(c:any)=>{
    noStore(c);if(!await currentAdmin(c))return fail(c,404,'NOT_FOUND','Not found.');
    const body:unknown=await c.req.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body)||(body as Record<string,unknown>).confirmDataDeletion!==true)
      return fail(c,400,'CONFIRMATION_REQUIRED','Set confirmDataDeletion to true to permanently erase this account data.');
    try{const result=await deleteStandardAccount(c.env.DB,c.req.param('id'));if(result==='not-found')return fail(c,404,'ACCOUNT_NOT_FOUND','That active or suspended standard account was not found.');
      return ok(c,{deleted:true,accountDataDeleted:true,sessionsRevoked:true,tombstoneRetained:true});
    }catch{return fail(c,503,'ADMIN_UNAVAILABLE','The account could not be deleted.');}
  });
}
