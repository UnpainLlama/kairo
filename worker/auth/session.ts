const SESSION_COOKIE='kairo_session';
export const SESSION_TTL_SECONDS=60*60*24*30;
export type SessionUser={id:string;sessionId:string;displayName:string;email:string|null;username:string;emailVerifiedAt:string|null;role:'user'|'admin';mustChangePassword:boolean};
type SessionRow={userId:string;sessionId:string;displayName:string;email:string|null;username:string;emailVerifiedAt:string|null;role:'user'|'admin';mustChangePassword:number};
export function createOpaqueToken():string{return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));}
export async function hashToken(token:string):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function readSessionCookie(cookieHeader:string|null):string|null{
  if(!cookieHeader)return null;
  for(const part of cookieHeader.split(';')){const separator=part.indexOf('=');if(separator<0)continue;if(part.slice(0,separator).trim()!==SESSION_COOKIE)continue;const value=part.slice(separator+1).trim();return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;}
  return null;
}
export function sessionCookie(token:string,secure=true,maxAgeSeconds=SESSION_TTL_SECONDS):string{
  const flags=[`${SESSION_COOKIE}=${token}`,'Path=/',`Max-Age=${Math.max(60,Math.min(SESSION_TTL_SECONDS,Math.floor(maxAgeSeconds)))}`,'HttpOnly','SameSite=Lax'];
  if(secure)flags.push('Secure');return flags.join('; ');
}
export function clearSessionCookie(secure=true):string{const flags=[`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`];if(secure)flags.push('Secure');return flags.join('; ');}
export async function createSession(db:D1Database,userId:string,metadata:{userAgent?:string;ipPrefix?:string;ttlSeconds?:number}={},now=Date.now()):Promise<{id:string;token:string;expiresAt:number;ttlSeconds:number}>{
  const id=crypto.randomUUID();const token=createOpaqueToken();const ttlSeconds=Math.max(60,Math.min(SESSION_TTL_SECONDS,Math.floor(metadata.ttlSeconds??SESSION_TTL_SECONDS)));const expiresAt=now+ttlSeconds*1000;
  await db.prepare(`INSERT INTO sessions(id,user_id,token_hash,expires_at,user_agent,ip_prefix) VALUES(?,?,?,?,?,?)`).bind(id,userId,await hashToken(token),expiresAt,metadata.userAgent?.slice(0,512)??null,metadata.ipPrefix?.slice(0,64)??null).run();
  return{id,token,expiresAt,ttlSeconds};
}
export async function revokeSession(db:D1Database,cookieHeader:string|null):Promise<void>{const token=readSessionCookie(cookieHeader);if(!token)return;await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hashToken(token)).run();}
/** Resolve the account exclusively from an active server-side session and password credential. */
export async function findSessionUser(db:D1Database,cookieHeader:string|null,now=Date.now()):Promise<SessionUser|null>{
  const token=readSessionCookie(cookieHeader);if(!token)return null;const tokenHash=await hashToken(token);
  const row=await db.prepare(`SELECT s.id AS sessionId,s.user_id AS userId,p.display_name AS displayName,p.email,p.username,p.email_verified_at AS emailVerifiedAt,p.role,uc.must_change_password AS mustChangePassword
    FROM sessions s INNER JOIN user_profiles p ON p.id=s.user_id INNER JOIN user_credentials uc ON uc.user_id=p.id
    WHERE s.token_hash=? AND s.expires_at>?
    AND COALESCE(s.last_used_at,s.created_at)>=CASE WHEN p.role='admin' THEN datetime('now','-60 minutes') ELSE datetime('now','-14 days') END
    AND p.account_status='active' LIMIT 1`).bind(tokenHash,now).first<SessionRow>();
  if(!row)return null;
  await db.prepare(`UPDATE sessions SET last_used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND (last_used_at IS NULL OR last_used_at<=datetime('now','-5 minutes'))`).bind(tokenHash).run();
  return{id:row.userId,sessionId:row.sessionId,displayName:row.displayName,email:row.email,username:row.username,emailVerifiedAt:row.emailVerifiedAt,role:row.role,mustChangePassword:Number(row.mustChangePassword)===1};
}
function toBase64Url(bytes:Uint8Array):string{let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
export async function hasRecentSession(db:D1Database,cookieHeader:string|null):Promise<boolean>{const token=readSessionCookie(cookieHeader);if(!token)return false;const row=await db.prepare("SELECT id FROM sessions WHERE token_hash=? AND expires_at>? AND created_at>=datetime('now','-15 minutes') LIMIT 1").bind(await hashToken(token),Date.now()).first<{id:string}>();return Boolean(row);}
