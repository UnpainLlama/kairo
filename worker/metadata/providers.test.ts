// FIXTURES BELOW ARE HAND-WRITTEN to follow each provider's documented response shape. They are NOT captured live responses.
// The adapters must be checked against the live APIs on first use (see docs/PROVIDERS.md, "First live check").
import { describe, it, expect } from 'vitest';
import { createAniListProvider, mapAniListMedia } from './providers/anilist';
import { createKitsuProvider, mapKitsuAnime } from './providers/kitsu';
import { assertAcceptableLicense, idsFromUrls, mapManamiEntry, parseSourceUrl, UnacceptableLicenseError } from './providers/manami';
import { ProviderError } from './types';
import { buildRegistry } from './service';

const NOW = '2026-11-06T00:00:00.000Z';
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
const signal = new AbortController().signal;

const aniMedia = { id: 1535, idMal: 1535, siteUrl: 'https://anilist.co/anime/1535', title: { romaji: 'Death Note', english: 'Death Note', native: 'デスノート' }, synonyms: ['DN'],
  description: 'A <i>notebook</i><br>falls.', format: 'TV', status: 'FINISHED', episodes: 37, season: 'FALL', seasonYear: 2006, startDate: { year: 2006 },
  genres: ['Mystery', 'Thriller'], averageScore: 84, coverImage: { extraLarge: 'https://img.test/x.jpg' }, bannerImage: 'http://insecure.test/b.jpg' };

describe('AniList adapter', () => {
  it('maps a media object, strips HTML, rescales the score and drops non-https images', () => {
    const m = mapAniListMedia(aniMedia, NOW);
    expect(m).toMatchObject({ provider: 'anilist', externalId: '1535', ids: { anilist: '1535', mal: '1535' }, format: 'series', status: 'finished', season: 'fall', year: 2006, episodeCount: 37, rating: 8.4, posterUrl: 'https://img.test/x.jpg', bannerUrl: null, synopsis: 'A notebook\nfalls.' });
  });
  it('rejects shapes without a valid id', () => {
    expect(() => mapAniListMedia({ title: {} }, NOW)).toThrow(ProviderError);
    expect(() => mapAniListMedia('x', NOW)).toThrow(ProviderError);
  });
  it('fetches by id with a POST to the allowlisted host only', async () => {
    let seen: { url: string; method?: string } | null = null;
    const p = createAniListProvider(async (url, init) => { seen = { url, method: init?.method }; return json({ data: { Media: aniMedia } }); }, () => NOW);
    expect((await p.fetchById('1535', signal)).title).toBe('Death Note');
    expect(seen).toEqual({ url: 'https://graphql.anilist.co', method: 'POST' });
  });
  it('maps 429 to rate_limited with Retry-After, 404 to not_found, 5xx and network errors to unavailable', async () => {
    const mk = (res: () => Promise<Response>) => createAniListProvider(res, () => NOW);
    await expect(mk(async () => json({ errors: [{ status: 429 }] }, { status: 429, headers: { 'Retry-After': '45' } })).fetchById('1', signal)).rejects.toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 45 });
    await expect(mk(async () => json({ data: null, errors: [{ status: 404, message: 'Not Found.' }] }, { status: 404 })).fetchById('1', signal)).rejects.toMatchObject({ kind: 'not_found' });
    await expect(mk(async () => json({}, { status: 502 })).fetchById('1', signal)).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(mk(async () => { throw new Error('net'); }).fetchById('1', signal)).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(mk(async () => new Response('<html>', { status: 200 })).fetchById('1', signal)).rejects.toMatchObject({ kind: 'invalid_response' });
  });
  it('skips malformed search results instead of failing the whole search', async () => {
    const p = createAniListProvider(async () => json({ data: { Page: { media: [aniMedia, { nope: true }] } } }), () => NOW);
    expect(await p.search('death note', signal)).toHaveLength(1);
  });
  it('rejects non-numeric ids without calling the network', async () => {
    const p = createAniListProvider(async () => { throw new Error('should not be called'); }, () => NOW);
    await expect(p.fetchById('1; DROP', signal)).rejects.toMatchObject({ kind: 'not_found' });
  });
});

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
    expect(buildRegistry('anilist', fetch).enabled.map((p) => p.id)).toEqual(['anilist']);
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
    expect(parseSourceUrl('https://anilist.co/anime/1535')).toEqual({ provider: 'anilist', id: '1535' });
    expect(parseSourceUrl('https://kitsu.io/anime/1376')).toEqual({ provider: 'kitsu', id: '1376' });
    expect(parseSourceUrl('https://evil.test/anime/1')).toBeNull();
    expect(parseSourceUrl('not a url')).toBeNull();
    expect(idsFromUrls(['https://myanimelist.net/anime/1535', 'https://kitsu.io/anime/1376', 'https://x.test/1'])).toEqual({ mal: '1535', kitsu: '1376' });
  });
  it('maps an entry without inventing synopsis, genres or rating, and skips unusable entries', () => {
    const entry = { sources: ['https://myanimelist.net/anime/1535', 'https://anilist.co/anime/1535'], title: 'Death Note', type: 'TV', episodes: 37, status: 'FINISHED',
      animeSeason: { season: 'FALL', year: 2006 }, picture: 'https://cdn.test/p.jpg', synonyms: ['DN'], relations: ['https://myanimelist.net/anime/2994'], tags: ['thriller'] };
    const m = mapManamiEntry(entry, NOW);
    expect(m?.metadata).toMatchObject({ provider: 'manami', ids: { mal: '1535', anilist: '1535' }, format: 'series', status: 'finished', season: 'fall', year: 2006, synopsis: null, genres: [], rating: null });
    expect(m?.relatedIds).toEqual([{ provider: 'mal', id: '2994' }]);
    expect(mapManamiEntry({ title: 'No sources', sources: [] }, NOW)).toBeNull();
    expect(mapManamiEntry({ sources: ['https://myanimelist.net/anime/1'] }, NOW)).toBeNull();
  });
});
