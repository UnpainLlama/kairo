// FIXTURES BELOW ARE HAND-WRITTEN to follow each provider's documented response shape. They are NOT captured live responses.
// The adapters must be checked against the live APIs on first use (see docs/PROVIDERS.md, "First live check").
import { describe, it, expect } from 'vitest';
import { createKitsuProvider, mapKitsuAnime } from './providers/kitsu';
import { assertAcceptableLicense, idsFromUrls, mapManamiEntry, parseSourceUrl, UnacceptableLicenseError } from './providers/manami';
import { ProviderError } from './types';
import { buildRegistry } from './service';

const NOW = '2026-11-06T00:00:00.000Z';
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
const signal = new AbortController().signal;

describe('Kitsu adapter', () => {
  const resource = { id: '1376', type: 'anime', attributes: { slug: 'death-note', canonicalTitle: 'Death Note', titles: { en: 'Death Note', en_jp: 'Death Note', ja_jp: 'デスノート' }, abbreviatedTitles: ['DN'],
    synopsis: 'A notebook.', subtype: 'TV', status: 'finished', startDate: '2006-10-04', episodeCount: 37, averageRating: '82.45', posterImage: { original: 'https://img.test/k.jpg' } },
    relationships: { categories: { data: [{ id: '5', type: 'categories' }] } } };
  const included = [{ id: '5', type: 'categories', attributes: { title: 'Thriller' } }, { id: '6', type: 'categories', attributes: { title: 'Unrelated' } }];

  it('maps JSON:API data and resolves category names; season stays null (never inferred)', () => {
    const m = mapKitsuAnime(resource, included, NOW);
    expect(m).toMatchObject({ provider: 'kitsu', externalId: '1376', format: 'series', status: 'finished', year: 2006, season: null, episodeCount: 37, rating: 8.2, genres: ['Thriller'] });
  });
  it('is not terms-verified, so it is off by default', () => {
    const k = createKitsuProvider(async () => json({}));
    expect(k.termsVerified).toBe(false);
    expect(buildRegistry(undefined, fetch).enabled).toEqual([]);
    expect(buildRegistry('kitsu, nope', fetch)).toMatchObject({ unknown: ['nope'] });
  });
  it('encodes the search text and only contacts kitsu.io', async () => {
    let url = '';
    const p = createKitsuProvider(async (u) => { url = u; return json({ data: [resource], included }); }, () => NOW);
    expect(await p.search('a&b=c', signal)).toHaveLength(1);
    expect(url.startsWith('https://kitsu.io/api/edge/anime?')).toBe(true);
    expect(url).toContain('filter%5Btext%5D=a%26b%3Dc');
  });
});

describe('anime-offline-database mapping', () => {
  it('accepts ODbL-1.0 only and refuses AGPL or missing licences', () => {
    expect(assertAcceptableLicense({ name: 'Open Data Commons Open Database License 1.0 (ODbL-1.0)' })).toBe('ODbL-1.0');
    expect(assertAcceptableLicense({ name: 'ODbL-1.0' })).toBe('ODbL-1.0');
    expect(() => assertAcceptableLicense({ name: 'GNU Affero General Public License v3.0' })).toThrow(UnacceptableLicenseError);
    expect(() => assertAcceptableLicense(undefined)).toThrow(UnacceptableLicenseError);
  });
  it('turns source URLs into a cross-provider id map', () => {
    expect(parseSourceUrl('https://kitsu.io/anime/1376')).toEqual({ provider: 'kitsu', id: '1376' });
    expect(parseSourceUrl('https://evil.test/anime/1')).toBeNull();
    expect(parseSourceUrl('not a url')).toBeNull();
    expect(idsFromUrls(['https://myanimelist.net/anime/1535', 'https://kitsu.io/anime/1376', 'https://x.test/1'])).toEqual({ mal: '1535', kitsu: '1376' });
  });
  it('maps an entry without inventing synopsis, genres or rating, and skips unusable entries', () => {
    const entry = { sources: ['https://myanimelist.net/anime/1535'], title: 'Death Note', type: 'TV', episodes: 37, status: 'FINISHED',
      animeSeason: { season: 'FALL', year: 2006 }, picture: 'https://cdn.test/p.jpg', synonyms: ['DN'], relations: ['https://myanimelist.net/anime/2994'], tags: ['thriller'] };
    const m = mapManamiEntry(entry, NOW);
    expect(m?.metadata).toMatchObject({ provider: 'manami', ids: { mal: '1535' }, format: 'series', status: 'finished', season: 'fall', year: 2006, synopsis: null, genres: [], rating: null });
    expect(m?.relatedIds).toEqual([{ provider: 'mal', id: '2994' }]);
    expect(mapManamiEntry({ title: 'No sources', sources: [] }, NOW)).toBeNull();
    expect(mapManamiEntry({ sources: ['https://myanimelist.net/anime/1'] }, NOW)).toBeNull();
  });
});
