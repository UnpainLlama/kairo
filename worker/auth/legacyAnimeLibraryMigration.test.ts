// @ts-ignore Node 22 built-in SQLite is used only by Vitest integration tests.
import { DatabaseSync } from 'node:sqlite';
// @ts-ignore The test harness applies the committed SQL migrations from disk.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { insertTestProfile, migrationFiles } from './testUtils';

describe('legacy Anime provider retirement migration 0026', () => {
  it('preserves saved references while removing the retired provider registration', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const file of migrationFiles.filter((name) => name !== '0026_retire_legacy_anime_provider.sql')) {
        db.exec(readFileSync('migrations/' + file, 'utf8'));
      }

      insertTestProfile(db, { id: 'legacy-user', username: 'legacy.user' });
      db.prepare("INSERT INTO anime (id, slug, title) VALUES ('legacy-anime', 'legacy-anime', 'Legacy Anime')").run();
      db.prepare(`
        INSERT INTO user_anime_library_refs
          (user_id, provider_id, external_id, slug, status, is_favorite, added_at, updated_at)
        VALUES ('legacy-user', 'anilist', '1535', 'legacy-anime-a1535', 'watching', 1, 10, 20)
      `).run();
      db.prepare(`
        INSERT INTO anime_provider_ids (anime_id, provider, external_id, source, confidence)
        VALUES ('legacy-anime', 'anilist', '1535', 'match', 1)
      `).run();
      db.prepare(`
        INSERT INTO anime_relations (anime_id, related_provider, related_external_id, source)
        VALUES ('legacy-anime', 'anilist', '2994', 'legacy-migration-test')
      `).run();
      db.prepare(`
        INSERT INTO anime_field_sources (anime_id, field, provider)
        VALUES ('legacy-anime', 'synopsis', 'anilist')
      `).run();

      db.exec(readFileSync('migrations/0026_retire_legacy_anime_provider.sql', 'utf8'));

      expect(db.prepare("SELECT provider_id, external_id, slug, status, is_favorite FROM user_anime_library_refs WHERE user_id='legacy-user'").get())
        .toEqual({ provider_id: 'legacy', external_id: '1535', slug: 'legacy-anime-a1535', status: 'watching', is_favorite: 1 });
      expect(db.prepare("SELECT provider, external_id FROM anime_provider_ids WHERE anime_id='legacy-anime'").get())
        .toEqual({ provider: 'legacy', external_id: '1535' });
      expect(db.prepare("SELECT related_provider, related_external_id FROM anime_relations WHERE anime_id='legacy-anime'").get())
        .toEqual({ related_provider: 'legacy', related_external_id: '2994' });
      expect(db.prepare("SELECT provider FROM anime_field_sources WHERE anime_id='legacy-anime'").get())
        .toEqual({ provider: 'legacy' });
      expect(db.prepare("SELECT COUNT(*) AS count FROM data_sources WHERE provider='anilist'").get())
        .toEqual({ count: 0 });
      expect(() => db.prepare(`
        INSERT INTO user_anime_library_refs
          (user_id, provider_id, external_id, slug, added_at, updated_at)
        VALUES ('legacy-user', 'anilist', '7', 'old-a7', 30, 30)
      `).run()).toThrow();
    } finally {
      db.close();
    }
  });
});
