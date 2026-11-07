import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import app from '../index';

function d1(db: DatabaseSync) {
  const stmt = (sql: string, binds: unknown[] = []) => ({
    bind: (...b: unknown[]) => stmt(sql, b),
    first: async () => (db.prepare(sql).get(...(binds as never[])) as unknown) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(binds as never[])) }),
    run: async () => { db.prepare(sql).run(...(binds as never[])); return {}; },
  });
  return { prepare: (sql: string) => stmt(sql) };
}

// Uses node:sqlite (built into Node 22.13+) so the real migrations and SQL run; only the provider's HTTP response is faked.
describe('metadata route end to end (real SQLite, fake provider fetch)', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('migrations/0001_initial_schema.sql', 'utf8'));
  db.exec(readFileSync('migrations/0002_provider_architecture.sql', 'utf8'));
  db.exec(readFileSync('migrations/0002_provider_architecture.sql', 'utf8')); // idempotent re-run
  db.prepare(`INSERT INTO anime (id, slug, title, format, release_year, status, episode_count, provider_id, provider_title_id) VALUES ('a1','death-note','Death Note','series',2006,'airing',36,'manami','mal:1535')`).run();
  db.prepare(`INSERT INTO anime_provider_ids (anime_id, provider, external_id, source) VALUES ('a1','mal','1535','dataset')`).run();
  const env = { DB: d1(db), APP_ENV: 'test', METADATA_PROVIDERS: 'anilist', CATALOG_SOURCE: 'db' };

  it('lists providers without secrets', async () => {
    const res = await app.request('/api/v1/providers', {}, env as never);
    const body = (await res.json()) as { data: { items: { id: string; enabled: boolean }[] } };
    expect(body.data.items.map((i) => `${i.id}:${i.enabled}`)).toEqual(['anilist:true', 'kitsu:false']);
  });
  it('degrades to the stored row when the provider is unreachable', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('offline'); }) as never;
    try {
      const res = await app.request('/api/v1/anime/death-note/metadata', {}, env as never);
      const body = (await res.json()) as { success: boolean; data: { title: string; status: string; providers: { state: string }[] }; meta: { degraded: boolean } };
      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({ title: 'Death Note', status: 'airing' });
      expect(body.data.providers[0].state).toBe('failed');
      expect(body.meta.degraded).toBe(true);
    } finally { globalThis.fetch = original; }
  });
  it('merges a provider answer, keeps provenance and saves the discovered id', async () => {
    const original = globalThis.fetch;
    const media = { id: 1535, idMal: 1535, title: { romaji: 'Death Note', english: 'Death Note' }, description: 'A notebook.', format: 'TV', status: 'FINISHED', episodes: 37, seasonYear: 2006, genres: ['Mystery'], averageScore: 84 };
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: { Page: { media: [media] } } }), { status: 200 })) as never;
    try {
      const res = await app.request('/api/v1/anime/a1/metadata', {}, env as never);
      const body = (await res.json()) as { data: { status: string; synopsis: string; rating: number; episodeCount: number; genres: string[]; ids: Record<string, string>; conflicts: { field: string }[]; provenance: Record<string, { provider: string }[]>; sources: { providerId: string }[] } };
      expect(body.data).toMatchObject({ status: 'finished', synopsis: 'A notebook.', rating: 8.4, episodeCount: 37, genres: ['Mystery'] });
      expect(body.data.ids).toMatchObject({ mal: '1535', anilist: '1535' });
      expect(body.data.provenance.status[0].provider).toBe('anilist');
      expect(body.data.conflicts.map((c) => c.field).sort()).toEqual(['episodeCount', 'status']);
      expect(body.data.sources.map((s) => s.providerId)).toEqual(['anilist', 'manami']);
      expect(db.prepare(`SELECT provider, external_id FROM anime_provider_ids WHERE anime_id='a1' ORDER BY provider`).all()).toEqual([{ provider: 'anilist', external_id: '1535' }, { provider: 'mal', external_id: '1535' }]);
    } finally { globalThis.fetch = original; }
  });
  it('readiness: ready on a migrated database, 503 on a reachable but unmigrated one', async () => {
    const ready = await app.request('/api/ready', {}, env as never);
    expect(ready.status).toBe(200);
    expect(((await ready.json()) as { data: Record<string, unknown> }).data).toMatchObject({ database: 'ok', schema: 'ok', cache: 'none', providers: ['anilist'] });
    const empty = { DB: d1(new DatabaseSync(':memory:')), APP_ENV: 'test', CATALOG_SOURCE: 'db' };
    const notReady = await app.request('/api/ready', {}, empty as never);
    expect(notReady.status).toBe(503);
    expect(((await notReady.json()) as { error: { code: string } }).error.code).toBe('CATALOG_UNAVAILABLE');
  });
  it('validates ids and 404s unknown titles', async () => {
    expect((await app.request('/api/v1/anime/bad%20id/metadata', {}, env as never)).status).toBe(400);
    expect((await app.request('/api/v1/anime/nope/metadata', {}, env as never)).status).toBe(404);
  });
  it('existing endpoints are unchanged', async () => {
    const res = await app.request('/api/v1/anime/death-note', {}, env as never);
    expect(((await res.json()) as { data: { slug: string } }).data.slug).toBe('death-note');
  });
});
