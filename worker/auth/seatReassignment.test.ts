import { afterEach, describe, expect, it } from 'vitest';
import { deleteStandardAccount } from '../admin/routes';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from './testUtils';

let db:any;
afterEach(()=>{db?.close();db=undefined;});

describe('account tombstone deletion under username/password auth',()=>{
  it('explicitly removes password credentials and account-owned rows while preserving the profile ID tombstone',async()=>{
    db=createTestDatabase();
    insertTestProfile(db,{id:'old-person',username:'old.person',displayName:'Former Member'});
    await insertTestCredential(db,'old-person','a long member passphrase');
    await createTestSession(db,'old-person');
    db.prepare("INSERT INTO anime(id,slug,title) VALUES('anime-old','anime-old','Old Anime')").run();
    db.prepare("INSERT INTO user_library(user_id,anime_id,status) VALUES('old-person','anime-old','watching')").run();
    db.prepare("INSERT INTO user_preferences(user_id,history_paused) VALUES('old-person',1)").run();
    db.prepare("INSERT INTO user_watch_history(user_id,anime_slug,episode_number,title,updated_at) VALUES('old-person','anime-old',1,'Old Anime',1)").run();
    db.prepare("INSERT INTO user_media_playback(user_id,media_type,media_key,title,updated_at) VALUES('old-person','anime','anime-old:1','Old Anime',1)").run();

    const result=await deleteStandardAccount(sqliteD1(db),'old-person');
    expect(result).toBe('deleted');
    expect(db.prepare("SELECT id,display_name,username,account_status FROM user_profiles WHERE id='old-person'").get())
      .toEqual({id:'old-person',display_name:'Former account',username:null,account_status:'deleted'});
    for(const table of ['user_credentials','sessions','user_library','user_preferences','user_watch_history','user_media_playback']){
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({count:0});
    }
    await expect(deleteStandardAccount(sqliteD1(db),'old-person')).resolves.toBe('not-found');
  });

  it('does not permit tombstoning an administrator through the standard-account delete helper',async()=>{
    db=createTestDatabase();
    insertTestProfile(db,{id:'admin-one',username:'site.admin',role:'admin'});
    await expect(deleteStandardAccount(sqliteD1(db),'admin-one')).resolves.toBe('not-found');
    expect(db.prepare("SELECT account_status FROM user_profiles WHERE id='admin-one'").get()).toEqual({account_status:'active'});
  });
});
