import { afterEach, describe, expect, it } from 'vitest';
import worker from '../index';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from './testUtils';

let db: any;
afterEach(() => { db?.close(); db = undefined; });

async function setup() {
  db = createTestDatabase();
  insertTestProfile(db, { id: 'library-user', username: 'library.user' });
  await insertTestCredential(db, 'library-user', 'a sufficiently long library password');
  const session = await createTestSession(db, 'library-user');
  return {
    session,
    env: { DB: sqliteD1(db), CATALOG_SOURCE: 'live' },
  };
}

describe('provider-backed Anime library references', () => {
  it('preserves legacy library references without enabling a legacy catalogue provider', async () => {
    const { session, env } = await setup();
    const headers = {
      Cookie: session.cookie,
      Origin: 'https://kairo.test',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const saved = await worker.request('https://kairo.test/api/v1/me/library/dorohedoro-a1535', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: 'watching', isFavorite: true }),
    }, env);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      data: { saved: true, source: 'provider_reference', providerId: 'legacy', externalId: '1535', status: 'watching', isFavorite: true },
    });

    const stored = db.prepare('SELECT provider_id AS providerId, external_id AS externalId, slug, status, is_favorite AS isFavorite FROM user_anime_library_refs WHERE user_id = ?').get('library-user');
    expect(stored).toMatchObject({
      providerId: 'legacy',
      externalId: '1535',
      slug: 'dorohedoro-a1535',
      status: 'watching',
      isFavorite: 1,
    });

    const listed = await worker.request('https://kairo.test/api/v1/me/library', {
      headers: { Cookie: session.cookie, Accept: 'application/json' },
    }, env);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      data: { items: [], references: [{ providerId: 'legacy', externalId: '1535', slug: 'dorohedoro-a1535', status: 'watching', isFavorite: true }] },
    });

    const removed = await worker.request('https://kairo.test/api/v1/me/library/dorohedoro-a1535', {
      method: 'DELETE',
      headers: { Cookie: session.cookie, Origin: 'https://kairo.test' },
    }, env);
    expect(removed.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS count FROM user_anime_library_refs WHERE user_id = ?').get('library-user').count).toBe(0);
  });

  it('supports legacy D1 library rows by slug as well as internal ID', async () => {
    const { session, env } = await setup();
    db.prepare("INSERT INTO anime (id, slug, title) VALUES ('legacy-anime-id', 'legacy-anime-title', 'Legacy Anime')").run();
    const saved = await worker.request('https://kairo.test/api/v1/me/library/legacy-anime-title', {
      method: 'PUT',
      headers: { Cookie: session.cookie, Origin: 'https://kairo.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'watching', isFavorite: false }),
    }, env);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ data: { saved: true, source: 'd1', animeId: 'legacy-anime-id' } });
    expect(db.prepare("SELECT anime_id FROM user_library WHERE user_id = 'library-user'").get()).toMatchObject({ anime_id: 'legacy-anime-id' });

    const removed = await worker.request('https://kairo.test/api/v1/me/library/legacy-anime-title', {
      method: 'DELETE',
      headers: { Cookie: session.cookie, Origin: 'https://kairo.test' },
    }, env);
    expect(removed.status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS count FROM user_library WHERE user_id = 'library-user'").get().count).toBe(0);
  });

  it('rejects malformed provider IDs and does not create a reference', async () => {
    const { session, env } = await setup();
    const response = await worker.request('https://kairo.test/api/v1/me/library/not-a-provider-id', {
      method: 'PUT',
      headers: { Cookie: session.cookie, Origin: 'https://kairo.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'watching', isFavorite: false }),
    }, env);
    expect(response.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS count FROM user_anime_library_refs WHERE user_id = ?').get('library-user').count).toBe(0);
  });
});
