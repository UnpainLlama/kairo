import { describe, expect, it } from 'vitest';
import { ProviderError, type EpisodeLookup } from '../metadata/types';
import { createHiAnimeEpisodeProvider } from './providers/hianime';
import { createJikanEpisodeProvider } from './providers/jikan';
import { normalizeProviderTitle, parseHiAnimeEpisodeLinks, parseHiAnimeSearchResults } from './parsers/hianime';

const lookup: EpisodeLookup = {
  cacheKey: 'm1535',
  title: 'Death Note',
  alternateTitles: ['デスノート', 'DN'],
  externalIds: { mal: '1535' },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const signal = new AbortController().signal;

describe('HiAnime HTML parser', () => {
  it('extracts numeric title slugs and episode anchors from the documented classes', () => {
    const search = '<div class="flw-item"><a class="dynamic-name" href="/watch/death-note-8" title="Death Note">Death Note</a></div>';
    const episodes = '<a class="ep-item" data-id="2001" data-number="1" title="Rebirth">Episode 1</a><a class="ssl-item ep-item" data-id="2002" data-number="2">Episode 2 - Confrontation</a>';
    expect(parseHiAnimeSearchResults(search)).toEqual([{ slug: 'death-note-8', numericId: '8', title: 'Death Note' }]);
    expect(parseHiAnimeEpisodeLinks(episodes)).toEqual([
      { providerEpisodeId: '2001', episodeNumber: 1, title: 'Rebirth' },
      { providerEpisodeId: '2002', episodeNumber: 2, title: 'Episode 2 - Confrontation' },
    ]);
    expect(normalizeProviderTitle('Dēsu Nōto')).toBe('desu noto');
  });

  it('rejects malformed anchors and cross-origin search links', () => {
    const html = '<a href="https://evil.example/watch/death-note-8" title="Death Note">x</a><a href="/watch/not-numeric" title="Death Note">x</a>';
    expect(parseHiAnimeSearchResults(html)).toEqual([]);
    expect(parseHiAnimeEpisodeLinks('<a class="ep-item" data-id="x" data-number="0">bad</a>')).toEqual([]);
  });
});

describe('HiAnime episode provider', () => {
  it('searches for an exact title match, then requests the documented episode-list endpoint', async () => {
    const urls: string[] = [];
    const refs: string[] = [];
    const provider = createHiAnimeEpisodeProvider(async (input, init) => {
      urls.push(input);
      refs.push(new Headers(init?.headers).get('Referer') ?? '');
      if (input.includes('/search?')) {
        return new Response('<a href="/watch/death-note-8" title="Death Note">Death Note</a>', { status: 200 });
      }
      return json({ status: true, html: '<a class="ep-item" data-id="2001" data-number="1" title="Rebirth">Episode 1</a><a class="ep-item" data-id="2002" data-number="2">Episode 2</a>' });
    });

    const page = await provider.listEpisodes(lookup, 1, signal);
    expect(urls[0]).toContain('/search?keyword=Death+Note&page=1');
    expect(urls[1]).toContain('/ajax/v2/episode/list/8');
    expect(refs[1]).toBe('https://hianimez.to/watch/death-note-8');
    expect(page).toMatchObject({ total: 2, hasNextPage: false, items: [{ episodeNumber: 1, title: 'Rebirth' }, { episodeNumber: 2 }] });
    expect(provider.termsVerified).toBe(false);
  });

  it('does not guess a fuzzy title match and does not follow redirects', async () => {
    const provider = createHiAnimeEpisodeProvider(async () => new Response('<a href="/watch/death-note-8" title="Death Note II">Death Note II</a>', { status: 200 }));
    await expect(provider.listEpisodes(lookup, 1, signal)).rejects.toMatchObject({ kind: 'not_found' });

    const redirecting = createHiAnimeEpisodeProvider(async () => new Response(null, { status: 302, headers: { Location: 'https://other.example/' } }));
    await expect(redirecting.listEpisodes(lookup, 1, signal)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('enforces the fixed HTTPS host allowlist', () => {
    expect(() => createHiAnimeEpisodeProvider(async () => new Response(''), 'http://hianimez.to')).toThrow(ProviderError);
    expect(() => createHiAnimeEpisodeProvider(async () => new Response(''), 'https://evil.example')).toThrow(ProviderError);
  });
});

describe('Jikan episode provider', () => {
  it('uses the known MAL id and normalizes the episode list', async () => {
    let url = '';
    const provider = createJikanEpisodeProvider(async (input) => {
      url = input;
      return json({ data: [{ mal_id: 1, title: 'Pilot', aired: '2026-10-01T00:00:00+00:00' }, { mal_id: 'bad' }], pagination: { has_next_page: false, items: { total: 1 } } });
    }, async () => {});
    const page = await provider.listEpisodes(lookup, 2, signal);
    expect(url).toContain('/anime/1535/episodes?page=2');
    expect(page).toEqual({ items: [{ episodeNumber: 1, title: 'Pilot', airedAt: '2026-10-01T00:00:00+00:00', synopsis: '', durationSeconds: null }], hasNextPage: false, total: 1 });
  });

  it('returns not_found when a MAL id is not available', async () => {
    const provider = createJikanEpisodeProvider(async () => { throw new Error('must not fetch'); }, async () => {});
    await expect(provider.listEpisodes({ ...lookup, externalIds: {} }, 1, signal)).rejects.toMatchObject({ kind: 'not_found' });
  });
});
