import { describe, expect, it } from 'vitest';
import { createMalSource, mapMalAnime } from './mal';

const NOW = '2026-11-27T00:00:00.000Z';
const signal = new AbortController().signal;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const anime = (id: number, extra: Record<string, unknown> = {}) => ({
  id, title: `Anime ${id}`, alternative_titles: { en: `Anime ${id} English`, ja: `アニメ${id}`, synonyms: ['Alias'] },
  start_date: '2026-10-01', start_season: { year: 2026, season: 'fall' }, synopsis: '<p>A synopsis.</p>',
  mean: 8.4, nsfw: 'white', rating: 'pg_13', media_type: 'tv', status: 'currently_airing',
  num_episodes: 12, genres: [{ id: 1, name: 'Action' }, { id: 2, name: 'Hentai' }], ...extra,
});
const source = (fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) =>
  createMalSource(fetchImpl, 'test-client-id', { wait: async () => undefined, now: () => NOW });

describe('MyAnimeList catalogue mapper', () => {
  it('normalises title metadata and never uses MAL image fields', () => {
    const mapped = mapMalAnime(anime(42, { main_picture: { large: 'https://mal.example/poster.jpg' } }), NOW);
    expect(mapped).toMatchObject({
      provider: 'mal', externalId: '42', ids: { mal: '42' }, title: 'Anime 42 English',
      titleRomaji: 'Anime 42', titleNative: 'アニメ42', synopsis: 'A synopsis.',
      format: 'series', status: 'airing', season: 'fall', year: 2026,
      episodeCount: 12, genres: ['Action'], rating: 8.4, posterUrl: null, bannerUrl: null,
    });
    expect(mapped.url).toBe('https://myanimelist.net/anime/42');
  });

  it('rejects malformed records', () => {
    expect(() => mapMalAnime({ title: 'No id' }, NOW)).toThrow();
  });
});

describe('MyAnimeList API v2 source', () => {
  it('uses the server-side Client ID and the official ranking endpoint', async () => {
    let requested = '';
    let headers: Headers | undefined;
    const src = source(async (url, init) => { requested = url; headers = new Headers(init?.headers); return response({ data: [anime(1)], paging: { next: 'https://api.myanimelist.net/v2/anime/ranking?offset=24' } }); });
    const result = await src.list('trending', 1, 24, signal);
    expect(new URL(requested).pathname).toBe('/v2/anime/ranking');
    expect(new URL(requested).searchParams.get('ranking_type')).toBe('bypopularity');
    expect(headers?.get('X-MAL-CLIENT-ID')).toBe('test-client-id');
    expect(result.items.map((item) => item.card.id)).toEqual(['m1']);
    expect(result.items[0]?.card.posterUrl).toBeNull();
    expect(result.hasNextPage).toBe(true);
  });

  it('uses the seasonal endpoint and applies year, genre and format filters', async () => {
    let requested = '';
    const src = source(async (url) => { requested = url; return response({ data: [anime(1), anime(2, { start_season: { year: 2025, season: 'fall' } })], paging: {} }); });
    const result = await src.browse({ season: 'fall', year: 2026, sort: 'popularity', page: 1, limit: 24, genre: 'Action', format: 'series' }, signal);
    expect(new URL(requested).pathname).toBe('/v2/anime/season/2026/fall');
    expect(result.items.map((item) => item.card.id)).toEqual(['m1']);
  });

  it('searches by text, paginates within a bounded window, and applies title filters', async () => {
    const requested: string[] = [];
    const src = source(async (url) => { requested.push(url); return response({ data: [anime(1), anime(2, { title: 'Unrelated', alternative_titles: { en: 'Other', ja: '', synonyms: [] } })], paging: {} }); });
    const result = await src.browse({ q: 'Anime 1', sort: 'relevance', page: 1, limit: 24 }, signal);
    expect(new URL(requested[0]!).searchParams.get('q')).toBe('Anime 1');
    expect(result.items.map((item) => item.card.id)).toEqual(['m1']);
  });

  it('derives genre counts from a bounded ranking response', async () => {
    const src = source(async () => response({ data: [anime(1), anime(2)], paging: {} }));
    expect(await src.genres(signal)).toEqual([{ name: 'Action', count: 2 }]);
  });

  it('resolves details and recommendations using MAL ids', async () => {
    let calls = 0;
    const src = source(async () => { calls += 1; return response({ data: anime(7, { recommendations: [{ node: anime(8) }] }) }); });
    expect(src.supports({ kind: 'm', id: 7 })).toBe(true);
    expect(src.supports({ kind: 'a', id: 7 })).toBe(false);
    const detail = await src.byRef({ kind: 'm', id: 7 }, signal);
    const related = await src.related({ kind: 'm', id: 7 }, 12, signal);
    expect(detail.card.id).toBe('m7');
    expect(related.map((item) => item.card.id)).toEqual(['m8']);
    expect(calls).toBe(2);
  });

  it('fails closed without a Client ID and maps API errors', async () => {
    const noKey = createMalSource(async () => response({}), undefined, { wait: async () => undefined });
    await expect(noKey.list('trending', 1, 24, signal)).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(source(async () => response({}, 404)).byRef({ kind: 'm', id: 1 }, signal)).rejects.toMatchObject({ kind: 'not_found' });
    await expect(source(async () => response({}, 429)).byRef({ kind: 'm', id: 1 }, signal)).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(source(async () => response({}, 403)).byRef({ kind: 'm', id: 1 }, signal)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
