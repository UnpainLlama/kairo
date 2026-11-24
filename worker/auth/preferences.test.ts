import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerHistoryPreferenceRoutes } from './preferences';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from './testUtils';

let db:any;
afterEach(()=>{db?.close();db=undefined;});

async function setup(){
  db=createTestDatabase();
  insertTestProfile(db,{id:'account-1',username:'test.user'});
  await insertTestCredential(db,'account-1','a sufficiently long preference password');
  const session=await createTestSession(db,'account-1');
  const app=new Hono();
  registerHistoryPreferenceRoutes(app);
  return {app,session,env:{DB:sqliteD1(db)}};
}

describe('account-wide history pause preference',()=>{
  it('defaults to recording and persists pause/resume for the same account',async()=>{
    const {app,session,env}=await setup();
    const headers={Cookie:session.cookie,Accept:'application/json'};
    const initial=await app.request('https://kairo.test/api/v1/me/preferences',{headers},env);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({data:{historyPaused:false}});
    const pause=await app.request('https://kairo.test/api/v1/me/preferences',{
      method:'PUT',headers:{...headers,'Content-Type':'application/json',Origin:'https://kairo.test'},
      body:JSON.stringify({historyPaused:true}),
    },env);
    expect(pause.status).toBe(200);
    expect(await pause.json()).toMatchObject({data:{historyPaused:true}});
    const resume=await app.request('https://kairo.test/api/v1/me/preferences',{
      method:'PUT',headers:{...headers,'Content-Type':'application/json',Origin:'https://kairo.test'},
      body:JSON.stringify({historyPaused:false}),
    },env);
    expect(resume.status).toBe(200);
    expect(await resume.json()).toMatchObject({data:{historyPaused:false}});
  });

  it('rejects invalid preference shapes and foreign origins',async()=>{
    const {app,session,env}=await setup();
    const headers={Cookie:session.cookie,'Content-Type':'application/json'};
    const invalid=await app.request('https://kairo.test/api/v1/me/preferences',{
      method:'PUT',headers,body:JSON.stringify({historyPaused:'true'}),
    },env);
    const cross=await app.request('https://kairo.test/api/v1/me/preferences',{
      method:'PUT',headers:{...headers,Origin:'https://attacker.test'},body:JSON.stringify({historyPaused:true}),
    },env);
    expect(invalid.status).toBe(400);
    expect(cross.status).toBe(403);
  });
});
