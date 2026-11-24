import {findSessionUser,type SessionUser} from './session';
/** The Worker session middleware resolves the account once and stores it on the request context. */
export async function getRequestUser(c:any):Promise<SessionUser|null>{
  const cached=c.get?.('authUser') as SessionUser|null|undefined;
  if(cached!==undefined)return cached;
  return findSessionUser(c.env.DB,c.req.header('Cookie')??null);
}
