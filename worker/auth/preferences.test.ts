import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerHistoryPreferenceRoutes } from './preferences';
import { createTestDatabase, createTestSession, insertTestCredential, insertTestProfile, sqliteD1 } from './testUtils';

let db: any;
afterEach(() => { db?.close(); db = undefined; });

async function setup() {
  db = createTestDatabase();
  insertTestProfile(db, { id: 'account-1', username: 'test.user' });
  await insertTestCredential(db, 'account-1', 'a sufficiently long preference password');
  const session = await createTestSession(db, 'account-1');
  const app = new Hono();
  registerHistoryPreferenceRoutes(app);
  return { app, session, env: { DB: sqliteD1(db) } };
}

describe('account-wide preferences', () => {
  it('returns defaults and persists validated settings for the same account', async () => {
    const { app, session, env } = await setup();
    const headers = { Cookie: session.cookie, Accept: 'application/json' };
    const initial = await app.request('https://kairo.test/api/v1/me/preferences', { headers }, env);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({
      data: { theme: 'astral-plum', subtitleLanguage: 'en', subtitleSize: 'medium', autoplayNext: true, defaultPlaybackSpeed: 1, historyPaused: false },
    });

    const update = await app.request('https://kairo.test/api/v1/me/preferences', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json', Origin: 'https://kairo.test' },
      body: JSON.stringify({ theme: 'ocean-circuit', subtitleLanguage: 'ja', subtitleSize: 'large', autoplayNext: false, defaultPlaybackSpeed: 1.5, historyPaused: true }),
    }, env);
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({
      data: { theme: 'ocean-circuit', subtitleLanguage: 'ja', subtitleSize: 'large', autoplayNext: false, defaultPlaybackSpeed: 1.5, historyPaused: true },
    });

    const reread = await app.request('https://kairo.test/api/v1/me/preferences', { headers }, env);
    expect(await reread.json()).toMatchObject({
      data: { theme: 'ocean-circuit', subtitleLanguage: 'ja', subtitleSize: 'large', autoplayNext: false, defaultPlaybackSpeed: 1.5, historyPaused: true },
    });
  });

  it('rejects invalid preferences and foreign origins', async () => {
    const { app, session, env } = await setup();
    const headers = { Cookie: session.cookie, 'Content-Type': 'application/json' };
    const invalid = await app.request('https://kairo.test/api/v1/me/preferences', {
      method: 'PUT', headers, body: JSON.stringify({ historyPaused: 'true' }),
    }, env);
    const invalidTheme = await app.request('https://kairo.test/api/v1/me/preferences', {
      method: 'PUT', headers, body: JSON.stringify({ theme: 'untrusted-theme' }),
    }, env);
    const cross = await app.request('https://kairo.test/api/v1/me/preferences', {
      method: 'PUT', headers: { ...headers, Origin: 'https://attacker.test' }, body: JSON.stringify({ historyPaused: true }),
    }, env);
    expect(invalid.status).toBe(400);
    expect(invalidTheme.status).toBe(400);
    expect(cross.status).toBe(403);
  });
});
