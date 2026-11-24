import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, insertTestProfile } from './testUtils';

let db:any;
afterEach(()=>{db?.close();db=undefined;});

describe('final username/password database constraints',()=>{
  it('permits one admin and at most 15 active or suspended standard accounts',()=>{
    db=createTestDatabase();
    insertTestProfile(db,{id:'admin-one',username:'site.admin',role:'admin'});
    for(let i=0;i<15;i++)insertTestProfile(db,{id:'member-'+i,username:'member'+String(i).padStart(2,'0'),status:i===0?'suspended':'active'});
    expect(()=>insertTestProfile(db,{id:'member-overflow',username:'overflow.member'})).toThrow(/standard_account_limit_reached/);
    expect(()=>insertTestProfile(db,{id:'admin-two',username:'second.admin',role:'admin'})).toThrow(/UNIQUE constraint failed/);
  });

  it('allows replacement seats after a standard account is tombstoned, but keeps deleted identities',()=>{
    db=createTestDatabase();
    for(let i=0;i<15;i++)insertTestProfile(db,{id:'member-'+i,username:'member'+String(i).padStart(2,'0')});
    db.prepare("UPDATE user_profiles SET account_status='deleted' WHERE id='member-0'").run();
    insertTestProfile(db,{id:'replacement-member',username:'replacement.member'});
    expect(db.prepare("SELECT COUNT(*) AS count FROM user_profiles WHERE role='user' AND account_status IN ('active','suspended')").get())
      .toEqual({count:15});
    expect(db.prepare("SELECT account_status FROM user_profiles WHERE id='member-0'").get()).toEqual({account_status:'deleted'});
  });

  it('enforces the 15-seat cap when a deleted tombstone is reactivated',()=>{
    db=createTestDatabase();
    for(let i=0;i<15;i++)insertTestProfile(db,{id:'member-'+i,username:'member'+String(i).padStart(2,'0')});
    insertTestProfile(db,{id:'deleted-member',username:'deleted.member',status:'deleted'});
    expect(()=>db.prepare("UPDATE user_profiles SET account_status='active' WHERE id='deleted-member'").run())
      .toThrow(/standard_account_limit_reached/);
  });

  it('creates credentials only for an existing profile and cascades on real profile deletion',()=>{
    db=createTestDatabase();
    insertTestProfile(db,{id:'member-one',username:'member.one'});
    db.prepare("INSERT INTO user_credentials(user_id,password_hash,must_change_password) VALUES('member-one','test-hash',1)").run();
    expect(db.prepare("SELECT must_change_password FROM user_credentials WHERE user_id='member-one'").get())
      .toEqual({must_change_password:1});
    db.prepare("DELETE FROM user_profiles WHERE id='member-one'").run();
    expect(db.prepare("SELECT COUNT(*) AS count FROM user_credentials WHERE user_id='member-one'").get()).toEqual({count:0});
  });
});
