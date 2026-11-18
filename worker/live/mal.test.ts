import { describe, expect, it } from 'vitest';
import { ProviderError } from '../metadata/types';
import { createMalSource, mapMalAnime } from './mal';
import { Pacer } from './pacer';
import { parseRef } from './ids';

const signal = new AbortController().signal;
const instant = new Pacer(0, Date.now, async () => {});
const anime = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Title ${id}`,
  main_picture: { large: `https://cdn.myanimelist.net/images/anime/${id}.jpg` },
  alternative_titles: { en: `English ${id}`, ja: `日本語 ${id}`, synonyms: [`Alias ${id}`] },
  start_date: '2026-10-04',
  start_season: { year: 2026, season: 'fall' },
  mean: 8.45,
  media_type: 'tv',
  status: 'currently_airing',
  num_episodes: 12,
  nsfw: 'white',
  genres: [{ id: 1, name: 'Action' }, { id: 2, name: 'Hentai' }],
  synopsis: 'A story with <b>HTML</b>.',
  ...extra,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('MyAnimeList API v2 mapping', () => {
  it('normalizes official anime fields, alternate names, images and score', () => {
    const mapped = mapMalAnime(anime(42), '2026-11-18T00:00:00.000Z');
    expect(mapped).toMatchObject({
      provider: 'mal', externalId: '42', ids: { mal: '42' },
      title: 'English 42', titleRomaji: 'Title 42', titleNative: '日本語 42',
      format: 'series', status: 'airing', season: 'fall', year: 2026,
      episodeCount: 12, genres: ['Action'], rating: 8.5,
      posterUrl: 'https://cdn.myanimelist.net/images/anime/42.jpg',
      synopsis: 'A story with HTML.',
    });
  });

  it('rejects malformed identifiers and filters non-white NSFW grades', async () => {
    expect(() => mapMalAnime({ ...anime(1), id: 0 }, 'now')).toThrow(ProviderError);
    const source = createMalSource(async () => json({ data: [
      { node: anime(1) }, { node: anime(2, { nsfw: 'gray' }) }, { node: anime(4, { nsfw: undefined }) },
    ] }), 'test-client', { pacer: instant });
    const result = await source.list('featured', 1, 12, signal);
    expect(result.items.map((item) => item.card.id)).toEqual(['m1']);
  });

  it('keeps the client ID server-side and uses official ranking and paging parameters', async () => {
    let requestUrl = '';
    let clientId = '';
    const source = createMalSource(async (url, init) => {
      requestUrl = url;
      clientId = new Headers(init?.headers).get('X-MAL-CLIENT-ID') ?? '';
      return json({ data: [{ node: anime(7), ranking: { rank: 1 } }], paging: { next: 'https://api.myanimelist.net/v2/anime/ranking?offset=12' } });
    }, 'private-test-id', { pacer: instant });
    const result = await source.list('trending', 1, 12, signal);
    const parsed = new URL(requestUrl);
    expect(parsed.origin + parsed.pathname).toBe('https://api.myanimelist.net/v2/anime/ranking');
    expect(parsed.searchParams.get('ranking_type')).toBe('bypopularity');
    expect(parsed.searchParams.get('fields')).toContain('genres');
    expect(parsed.searchParams.get('nsfw')).toBeNull();
    expect(clientId).toBe('private-test-id');
    expect(result.items[0]?.card.id).toBe('m7');
    expect(result.hasNextPage).toBe(true);
  });

  it('searches MAL and drops unrelated results from empty-ish queries', async () => {
    const source = createMalSource(async () => json({ data: [{ node: anime(3) }], paging: {} }), 'test-client', { pacer: instant });
    const exact = await source.browse({ q: 'English 3', sort: 'relevance', page: 1, limit: 24 }, signal);
    const unrelated = await source.browse({ q: 'no-such-title-zzz', sort: 'relevance', page: 1, limit: 24 }, signal);
    expect(exact.items[0]?.card.id).toBe('m3');
    expect(unrelated.items).toEqual([]);
  });

  it('reads a plain detail object and recommendation nodes from the detail endpoint', async () => {
    const urls: string[] = [];
    const source = createMalSource(async (url) => {
      urls.push(url);
      return json(anime(42, { recommendations: [{ node: anime(43), num_recommendations: 12 }] }));
    }, 'test-client', { pacer: instant });
    const ref = parseRef('the-title-m42');
    expect(ref).toEqual({ kind: 'm', id: 42 });
    const title = await source.byRef(ref!, signal);
    const related = await source.related(ref!, 10, signal);
    expect(new URL(urls[0]!).pathname).toBe('/v2/anime/42');
    expect(new URL(urls[0]!).searchParams.get('fields')).toContain('synopsis');
    expect(new URL(urls[0]!).searchParams.get('nsfw')).toBeNull();
    expect(title.card.id).toBe('m42');
    expect(related.map((item) => item.card.id)).toEqual(['m43']);
  });

  it('returns an unavailable configuration error when no Worker client ID is set', async () => {
    const source = createMalSource(async () => { throw new Error('must not fetch'); }, undefined, { pacer: instant });
    await expect(source.list('featured', 1, 12, signal)).rejects.toMatchObject({ kind: 'unavailable' });
  });


  it('matches only the 64-character query actually sent to MAL', async () => {
    const longQuery = 'A'.repeat(65);
    let requested = '';
    const source = createMalSource(async (url) => {
      requested = new URL(url).searchParams.get('q') ?? '';
      return json({ data: [{ node: anime(91, {
        title: 'A'.repeat(64),
        alternative_titles: { en: null, ja: null, synonyms: [] },
      }) }], paging: {} });
    }, 'test-client', { pacer: instant });
    const result = await source.browse({ q: longQuery, sort: 'relevance', page: 1, limit: 24 }, signal);
    expect(requested).toBe('A'.repeat(64));
    expect(result.items.map((item) => item.card.id)).toEqual(['m91']);
  });

  it('uses the current MAL season when no year is selected', async () => {
    let requestedPath = '';
    const source = createMalSource(async (url) => {
      requestedPath = new URL(url).pathname;
      return json({ data: [{ node: anime(92) }], paging: {} });
    }, 'test-client', { pacer: instant, now: () => '2026-11-18T00:00:00.000Z' });
    const result = await source.browse({ season: 'fall', sort: 'popularity', page: 1, limit: 24 }, signal);
    expect(requestedPath).toBe('/v2/anime/season/2026/fall');
    expect(result.items.map((item) => item.card.id)).toEqual(['m92']);
  });

  it('filters a season across matching search results when the year is left as Any year', async () => {
    const source = createMalSource(async () => json({ data: [
      { node: anime(93, { start_season: { year: 2025, season: 'fall' } }) },
      { node: anime(94, { start_season: { year: 2026, season: 'spring' } }) },
    ], paging: {} }), 'test-client', { pacer: instant });
    const result = await source.browse({ q: 'English 93', season: 'fall', sort: 'relevance', page: 1, limit: 24 }, signal);
    expect(result.items.map((item) => item.card.id)).toEqual(['m93']);
  });

  it('does not advertise pages beyond its bounded 500-row filter scan', async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({
      node: anime(index + 1, { media_type: index === 0 ? 'movie' : 'tv' }),
    }));
    const source = createMalSource(async () => json({ data: rows, paging: { next: 'https://api.myanimelist.net/v2/anime/ranking?offset=500' } }), 'test-client', { pacer: instant });
    const result = await source.browse({ format: 'movie', sort: 'popularity', page: 1, limit: 24 }, signal);
    expect(result.items.map((item) => item.card.id)).toEqual(['m1']);
    expect(result.hasNextPage).toBe(false);
    expect(result.total).toBeNull();
  });

  it('derives genres from the returned MAL ranked sample instead of inventing a genre API', async () => {
    const source = createMalSource(async () => json({ data: [
      { node: anime(1) }, { node: anime(2, { genres: [{ id: 1, name: 'Action' }, { id: 3, name: 'Drama' }] }) },
    ], paging: {} }), 'test-client', { pacer: instant });
    expect(await source.genres(signal)).toEqual([
      { name: 'Action', count: 2 }, { name: 'Drama', count: 1 },
    ]);
  });
});
