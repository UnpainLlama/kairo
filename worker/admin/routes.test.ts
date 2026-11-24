import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerAdminRoutes, rotateAdminConsolePath, deleteStandardAccount } from './routes';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from '../auth/testUtils';

let db:any;
afterEach(()=>{db?.close();db=undefined;});

async function adminApp(){
  db=createTestDatabase();
  insertTestProfile(db,{id:'admin-one',username:'site.admin',role:'admin'});
  await insertTestCredential(db,'admin-one','admin long passphrase');
  const session=await createTestSession(db,'admin-one',8*60*60);
  const app=new Hono();
  registerAdminRoutes(app);
  return {app,env:{DB:sqliteD1(db)},cookie:session.cookie};
}

describe('administrator console path rotation',()=>{
  it('generates a 256-bit URL-safe path only when an active administrator exists',async()=>{
    db=createTestDatabase();
    insertTestProfile(db,{id:'admin-one',username:'site.admin',role:'admin'});
    await rotateAdminConsolePath(sqliteD1(db));
    const row=db.prepare('SELECT path_value FROM admin_console_access WHERE singleton_id=1').get() as any;
    expect(row.path_value).toMatch(/^\/[A-Za-z0-9_-]{43}$/);
  });
  it('does not invalidate an unexpired path during scheduled maintenance',async()=>{
    db=createTestDatabase();
    insertTestProfile(db,{id:'admin-one',username:'site.admin',role:'admin'});
    const d1=sqliteD1(db);
    await rotateAdminConsolePath(d1);
    const before=db.prepare('SELECT path_value FROM admin_console_access WHERE singleton_id=1').get() as any;
    await rotateAdminConsolePath(d1);
    const after=db.prepare('SELECT path_value FROM admin_console_access WHERE singleton_id=1').get() as any;
    expect(after.path_value).toBe(before.path_value);
  });
  it('does not create a console path if there is no active administrator',async()=>{
    db=createTestDatabase();
    await rotateAdminConsolePath(sqliteD1(db));
    expect(db.prepare('SELECT COUNT(*) AS count FROM admin_console_access').get()).toEqual({count:0});
  });
});

describe('admin account lifecycle',()=>{
  it('creates a user with a one-time temporary password and server-enforced change flag',async()=>{
    const {app,env,cookie}=await adminApp();
    const response=await app.request('https://kairo.test/api/v1/admin/accounts',{
      method:'POST',headers:{Cookie:cookie,Origin:'https://kairo.test','Content-Type':'application/json'},
      body:JSON.stringify({username:'member.two',displayName:'Member Two'}),
    },env);
    expect(response.status).toBe(201);
    const payload=await response.json() as any;
    expect(payload.data).toMatchObject({created:true,username:'member.two',mustChangePassword:true});
    expect(typeof payload.data.temporaryPassword).toBe('string');
    expect(payload.data.temporaryPassword).not.toBe('admin/admin');
    expect(db.prepare('SELECT must_change_password FROM user_credentials WHERE user_id=?').get(payload.data.accountId))
      .toEqual({must_change_password:1});
  });

  it('enrols an existing profile without changing its owner ID and explicitly deletes credentials on tombstoning',async()=>{
    const {app,env,cookie}=await adminApp();
    insertTestProfile(db,{id:'legacy-member',username:'legacy_member'});
    db.prepare("INSERT INTO anime(id,slug,title) VALUES('legacy-anime','legacy-anime','Legacy Anime')").run();
    db.prepare("INSERT INTO user_library(user_id,anime_id,status) VALUES('legacy-member','legacy-anime','watching')").run();
    const enrol=await app.request('https://kairo.test/api/v1/admin/accounts/legacy-member/enroll',{
      method:'POST',headers:{Cookie:cookie,Origin:'https://kairo.test','Content-Type':'application/json'},
      body:JSON.stringify({username:'renamed.member'}),
    },env);
    expect(enrol.status).toBe(200);
    expect(await enrol.json()).toMatchObject({data:{enrolled:true,accountId:'legacy-member',username:'renamed.member',mustChangePassword:true}});
    expect(db.prepare("SELECT user_id FROM user_library WHERE user_id='legacy-member'").get()).toEqual({user_id:'legacy-member'});
    expect(await deleteStandardAccount(sqliteD1(db),'legacy-member')).toBe('deleted');
    expect(db.prepare("SELECT account_status FROM user_profiles WHERE id='legacy-member'").get()).toEqual({account_status:'deleted'});
    expect(db.prepare("SELECT COUNT(*) AS count FROM user_credentials WHERE user_id='legacy-member'").get()).toEqual({count:0});
  });

  it('maps the standard-account trigger to HTTP 409',async()=>{
    const {app,env,cookie}=await adminApp();
    for(let i=0;i<15;i++) insertTestProfile(db,{id:'member-'+i,username:'member.'+String(i).padStart(2,'0')});
    const response=await app.request('https://kairo.test/api/v1/admin/accounts',{
      method:'POST',headers:{Cookie:cookie,Origin:'https://kairo.test','Content-Type':'application/json'},
      body:JSON.stringify({username:'extra.member',displayName:'Extra'}),
    },env);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({error:{code:'ACCOUNT_LIMIT_REACHED'}});
  });

  it('suspension revokes all sessions for the target user',async()=>{
    const {app,env,cookie}=await adminApp();
    insertTestProfile(db,{id:'member-suspend',username:'member.suspend'});
    await insertTestCredential(db,'member-suspend','initial member password phrase');
    await createTestSession(db,'member-suspend');
    const response=await app.request('https://kairo.test/api/v1/admin/accounts/member-suspend/status',{
      method:'PATCH',headers:{Cookie:cookie,Origin:'https://kairo.test','Content-Type':'application/json'},
      body:JSON.stringify({status:'suspended'}),
    },env);
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id='member-suspend'").get()).toEqual({count:0});
  });
});
