import { afterEach, describe, expect, it } from 'vitest';
import app from './index';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from './auth/testUtils';

let db:any;
afterEach(()=>{db?.close();db=undefined;});
const worker=app as unknown as {request(input:string,init?:RequestInit,env?:unknown):Promise<Response>};
const origin='https://kairo.test';

describe('global API Origin/Referer protection',()=>{
  it('rejects state-changing requests with no Origin or Referer',async()=>{
    const response=await worker.request(origin+'/api/__origin_guard_test',{method:'POST'},{});
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({error:{code:'ORIGIN_FORBIDDEN'}});
  });
  it('rejects foreign origins and accepts matching Origin or Referer',async()=>{
    const foreign=await worker.request(origin+'/api/__origin_guard_test',{method:'PATCH',headers:{Origin:'https://attacker.test'}},{});
    const sameOrigin=await worker.request(origin+'/api/__origin_guard_test',{method:'POST',headers:{Origin:origin}},{});
    const referer=await worker.request(origin+'/api/__origin_guard_test',{method:'DELETE',headers:{Referer:origin+'/admin'}},{});
    expect(foreign.status).toBe(403);
    expect(sameOrigin.status).toBe(404);
    expect(referer.status).toBe(404);
  });
  it('enforces the Origin guard on the public login route',async()=>{
    const missing=await worker.request(origin+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},{});
    const foreign=await worker.request(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:'https://attacker.test','Content-Type':'application/json'},body:'{}'},{});
    const local=await worker.request(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'},{});
    expect(missing.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(local.status).toBe(401);
  });
  it('allows same-origin browser CORS preflight before the session gate',async()=>{
    const response=await worker.request(origin+'/api/v1/auth/login',{
      method:'OPTIONS',
      headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},
    },{ALLOWED_ORIGIN:origin});
    expect([200,204]).toContain(response.status);
  });
});

describe('closed-site API default deny',()=>{
  it('keeps health, ready, login, logout and bootstrap reachable without a session',async()=>{
    db=createTestDatabase();
    const env={DB:sqliteD1(db),CATALOG_SOURCE:'db',ADMIN_BOOTSTRAP_TOKEN:'b'.repeat(32)};
    const health=await worker.request(origin+'/api/health',{},env);
    const ready=await worker.request(origin+'/api/ready',{},env);
    const login=await worker.request(origin+'/api/v1/auth/login',{
      method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}',
    },env);
    const logout=await worker.request(origin+'/api/v1/auth/logout',{method:'POST',headers:{Origin:origin}},env);
    const bootstrap=await worker.request(origin+'/api/v1/admin/bootstrap',{
      method:'POST',headers:{Origin:origin,'X-Kairo-Bootstrap':'b'.repeat(32),'Content-Type':'application/json'},body:'{}',
    },env);
    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(login.status).toBe(400);
    expect(logout.status).toBe(200);
    expect(bootstrap.status).toBe(400);
  });

  it('denies catalogue, Anime, Movies, stream, admin and YouTube routes without a session',async()=>{
    for(const path of [
      '/api/v1/catalog/genres','/api/v1/anime/a7','/api/v1/movies/discover',
      '/api/v1/anime/a7/episodes/1/servers','/api/v1/anime/a7/episodes/1/servers/1/playback',
      '/api/v1/admin/accounts','/api/v1/youtube/history','/api/v1/me/preferences',
    ]){
      const response=await worker.request(origin+path,{}, {});
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({error:{code:'AUTH_REQUIRED'}});
    }
  });

  it('restricts a temporary-password session to /me, /me/password and logout',async()=>{
    db=createTestDatabase();
    insertTestProfile(db,{id:'forced-user',username:'forced.user'});
    await insertTestCredential(db,'forced-user','temporary generated phrase',true);
    const session=await createTestSession(db,'forced-user');
    const env={DB:sqliteD1(db),CATALOG_SOURCE:'db'};
    const me=await worker.request(origin+'/api/v1/me',{headers:{Cookie:session.cookie}},env);
    const catalog=await worker.request(origin+'/api/v1/catalog/genres',{headers:{Cookie:session.cookie}},env);
    const password=await worker.request(origin+'/api/v1/me/password',{
      method:'POST',headers:{Cookie:session.cookie,Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({currentPassword:'temporary generated phrase',newPassword:'a strong changed passphrase'}),
    },env);
    expect(me.status).toBe(200);
    expect(catalog.status).toBe(403);
    expect(await catalog.json()).toMatchObject({error:{code:'PASSWORD_CHANGE_REQUIRED'}});
    expect(password.status).toBe(200);
    const catalogAfter=await worker.request(origin+'/api/v1/catalog/genres',{headers:{Cookie:session.cookie}},env);
    expect(catalogAfter.status).not.toBe(403);
  });

  it('does not expose admin handlers to standard signed-in accounts',async()=>{
    db=createTestDatabase();
    insertTestProfile(db,{id:'standard-user',username:'member.user'});
    await insertTestCredential(db,'standard-user','a long member password');
    const session=await createTestSession(db,'standard-user');
    const response=await worker.request(origin+'/api/v1/admin/accounts',{headers:{Cookie:session.cookie}},{DB:sqliteD1(db)});
    expect(response.status).toBe(404);
  });
});
