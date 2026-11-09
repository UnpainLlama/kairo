import { describe, it, expect } from 'vitest';
import { mergeMetadata } from './merge';
import type { NormalizedMetadata } from './types';

const meta = (o: Partial<NormalizedMetadata> & { provider: string }): NormalizedMetadata => ({
  externalId: '1', ids: {}, url: null, title: null, titleEnglish: null, titleRomaji: null, titleNative: null, synonyms: [], synopsis: null,
  format: null, status: null, season: null, year: null, episodeCount: null, genres: [], posterUrl: null, bannerUrl: null, rating: null,
  fetchedAt: '2026-11-06T00:00:00.000Z', ...o,
});

describe('mergeMetadata', () => {
  const store = meta({ provider: 'manami', title: 'Death Note', status: 'airing', episodeCount: 36, year: 2006, ids: { mal: '1535', kitsu: '1376' }, genres: ['Thriller'] });
  const anilist = meta({ provider: 'anilist', title: 'Death Note', status: 'finished', episodeCount: 37, year: 2006, synopsis: 'A notebook.', rating: 8.4, genres: ['thriller', 'Mystery'], ids: { anilist: '1535', mal: '1535' } });

  it('applies the priority table and records every disagreement with provenance', () => {
    const u = mergeMetadata([store, anilist]);
    expect(u.status).toBe('finished');
    expect(u.episodeCount).toBe(37);
    expect(u.provenance.status).toEqual([{ provider: 'anilist', fetchedAt: '2026-11-06T00:00:00.000Z' }]);
    expect(u.conflicts.map((c) => c.field).sort()).toEqual(['episodeCount', 'status']);
    const status = u.conflicts.find((c) => c.field === 'status');
    expect(status?.chosen).toEqual({ provider: 'anilist', value: 'finished' });
    expect(status?.alternatives).toEqual([{ provider: 'manami', value: 'airing' }]);
  });
  it('falls back to a lower-priority provider when the preferred one has no value, and never invents one', () => {
    const u = mergeMetadata([store, meta({ provider: 'anilist', title: 'Death Note' })]);
    expect(u.status).toBe('airing');
    expect(u.synopsis).toBeNull();
    expect(u.rating).toBeNull();
    expect(u.conflicts).toEqual([]);
  });
  it('unions genres and ids without duplicates and lists contributors', () => {
    const u = mergeMetadata([store, anilist]);
    expect(u.genres).toEqual(['thriller', 'Mystery']);
    expect(u.ids).toEqual({ anilist: '1535', mal: '1535', kitsu: '1376' });
    expect(u.provenance.genres?.map((p) => p.provider)).toEqual(['anilist', 'manami']);
    expect(u.contributors).toEqual(['anilist', 'manami']);
  });
  it('ranks unlisted providers last and is deterministic', () => {
    const extra = meta({ provider: 'zeta', title: 'Z title', status: 'hiatus' });
    expect(mergeMetadata([extra, store]).status).toBe('airing');
    expect(mergeMetadata([store, extra])).toEqual(mergeMetadata([extra, store]));
  });
});
