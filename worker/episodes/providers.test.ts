import { describe, expect, it } from 'vitest';
import { ProviderError, type EpisodeLookup } from '../metadata/types';
import { createHiAnimeEpisodeProvider } from './providers/hianime';
import { createJikanEpisodeProvider } from './providers/jikan';
import { normalizeProviderTitle, parseHiAnimeEpisodeLinks, parseHiAnimeSearchResults } from './parsers/hianime';
import { decodeHiAnimeDataHash, parseHiAnimeServers, stableServerIdFromHash } from '../hianime/parser';

const lookup: EpisodeLookup = {
  cacheKey: 'h8', title: 'Death Note', alternateTitles: ['デスノート', 'DN'], externalIds: {},
  providerUrl: 'https://hianime.at/watch/death-note-8',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const signal = new AbortController().signal;

describe('HiAnime parser', () => {
  it('extracts the extension-style search slug and episode anchors', () => {
    const search = '<div class="flw-item"><a class="film-name" href="/watch/death-note-8" title="Death Note">Death Note</a></div>';
    const episodes = '<a class="ep-item" data-id="2001" data-number="1" title="Rebirth">Episode 1</a><a class="ssl-item ep-item" data-id="2002" data-number="2">Episode 2 - Confrontation</a>';
    expect(parseHiAnimeSearchResults(search, 'https://hianime.at')).toEqual([{ slug: 'death-note-8', numericId: '8', title: 'Death Note' }]);
    expect(parseHiAnimeEpisodeLinks(episodes)).toEqual([
      { providerEpisodeId: '2001', episodeNumber: 1, title: 'Rebirth' },
      { providerEpisodeId: '2002', episodeNumber: 2, title: 'Episode 2 - Confrontation' },
    ]);
    expect(normalizeProviderTitle('Dēsu Nōto')).toBe('desu noto');
  });

  it('rejects cross-origin search links and malformed episode identifiers', () => {
    const html = '<div class="flw-item"><a href="https://evil.example/watch/death-note-8" title="Death Note">x</a></div>';
    expect(parseHiAnimeSearchResults(html, 'https://hianime.at')).toEqual([]);
    expect(parseHiAnimeEpisodeLinks('<a class="ep-item" data-id="x" data-number="0">bad</a>')).toEqual([]);
  });
});

describe('HiAnime episode provider', () => {
  it('uses the CloudStream extension endpoint and returns provider episode ids', async () => {
    const urls: string[] = [];
    const headers: Headers[] = [];
    const provider = createHiAnimeEpisodeProvider(async (input, init) => {
      urls.push(input);
      headers.push(new Headers(init?.headers));
      return json({ status: true, html: '<a class="ep-item" data-id="2001" data-number="1" title="Rebirth">Episode 1</a><a class="ep-item" data-id="2002" data-number="2">Episode 2</a>' });
    }, 'https://hianime.at');

    const page = await provider.listEpisodes(lookup, 1, signal);
    expect(urls).toEqual(['https://hianime.at/api/theme/episode/list/8']);
    expect(headers[0]?.get('Origin')).toBe('https://hianime.at');
    expect(headers[0]?.get('Referer')).toBe('https://hianime.at/watch/death-note-8');
    expect(headers[0]?.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(page).toMatchObject({ total: 2, hasNextPage: false, items: [{ episodeNumber: 1, title: 'Rebirth', providerEpisodeId: '2001' }, { episodeNumber: 2, providerEpisodeId: '2002' }] });
    expect(provider.termsVerified).toBe(true);
  });

  it('matches a known alternate title returned by the first search response', async () => {
    const urls: string[] = [];
    const provider = createHiAnimeEpisodeProvider(async (input) => {
      urls.push(input);
      if (input.includes('/search?')) {
        return new Response('<div class="flw-item"><a class="film-name" href="/watch/death-note-8" title="Death Note: Rebirth">Death Note: Rebirth</a></div>', { status: 200 });
      }
      return json({ status: true, html: '<a class="ep-item" data-id="2001" data-number="1" title="Rebirth">Episode 1</a>' });
    }, 'https://hianime.at');
    const page = await provider.listEpisodes({ ...lookup, alternateTitles: ['DN', 'デスノート', 'Death Note: Rebirth'], providerUrl: null }, 1, signal);
    expect(urls).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ episodeNumber: 1, providerEpisodeId: '2001' });
  });

  it('discovers sub/dub servers without resolving media sources', async () => {
    const urls: string[] = [];
    const provider = createHiAnimeEpisodeProvider(async (input) => {
      urls.push(input);
      return json({ status: true, html: '<div class="server-item" data-id="901" data-type="sub" data-server-id="1">HD-1</div><div class="server-item" data-id="902" data-type="dub" data-server-id="2">HD-2</div>' });
    }, 'https://hianime.at');
    const servers = await provider.listServers!('2001', lookup, signal);
    expect(urls).toEqual(['https://hianime.at/api/theme/episode/servers?episodeId=2001']);
    expect(servers).toEqual([{ id: '901', type: 'sub', name: 'HD-1' }, { id: '902', type: 'dub', name: 'HD-2' }]);
  });

  it('resolves only a plain provider-returned URL on an exact approved host', async () => {
    const hash = btoa('https://zokoanime.video/embed/abc');
    const provider = createHiAnimeEpisodeProvider(async () => json({ status: true, html: `<div class="server-item" data-type="sub" data-hash="${hash}">Zoko</div>` }), 'https://hianime.at', ['zokoanime.video']);
    const serverId = stableServerIdFromHash(hash);
    await expect(provider.resolveServer!(serverId, lookup, signal, '2001')).resolves.toMatchObject({ provider: 'hianime', protocol: 'embed', embedUrl: 'https://zokoanime.video/embed/abc' });
    const blocked = createHiAnimeEpisodeProvider(async () => json({ status: true, html: `<div class="server-item" data-type="sub" data-hash="${hash}">Zoko</div>` }), 'https://hianime.at', ['megaplay.buzz']);
    await expect(blocked.resolveServer!(serverId, lookup, signal, '2001')).resolves.toBeNull();
  });

  it('rejects an unsafe configured mirror', () => {
    expect(() => createHiAnimeEpisodeProvider(async () => new Response(''), 'http://hianime.at')).toThrow(ProviderError);
    expect(() => createHiAnimeEpisodeProvider(async () => new Response(''), 'https://evil.example')).toThrow(ProviderError);
  });
});



describe('HiAnime playback server parsing', () => {
  it('preserves readable server names and legacy numeric ids', () => {
    expect(parseHiAnimeServers('<div class="server-item" data-id="901" data-type="sub">HD-1</div><div class="server-item" data-server-id="902" data-type="dub"><span>HD-2</span></div>'))
      .toMatchObject([{ providerServerId: '901', name: 'HD-1' }, { providerServerId: '902', name: 'HD-2' }]);
  });

  it('uses reversible opaque ids for data-hash values and decodes only plain HTTPS URLs', () => {
    const hash = btoa('https://zokoanime.video/embed/abc');
    const servers = parseHiAnimeServers(`<div class="server-item" data-type="sub" data-hash="${hash}">Zoko</div>`);
    expect(servers).toEqual([{ providerServerId: stableServerIdFromHash(hash), type: 'sub', name: 'Zoko', dataHash: hash, embedUrl: 'https://zokoanime.video/embed/abc' }]);
    expect(decodeHiAnimeDataHash(btoa('javascript:alert(1)'))).toBeNull();
    expect(decodeHiAnimeDataHash('%%%')).toBeNull();
  });

  it('does not collapse distinct hashes to the same server id', () => {
    expect(stableServerIdFromHash('YWJj')).not.toBe(stableServerIdFromHash('YWJk'));
  });
});

describe('Jikan episode provider', () => {
  it('uses the known MAL id and normalizes the episode list', async () => {
    let url = '';
    const provider = createJikanEpisodeProvider(async (input) => {
      url = input;
      return json({ data: [{ mal_id: 1, title: 'Pilot', aired: '2026-10-01T00:00:00+00:00' }, { mal_id: 'bad' }], pagination: { has_next_page: false, items: { total: 1 } } });
    }, async () => {});
    const page = await provider.listEpisodes({ ...lookup, externalIds: { mal: '1535' }, providerUrl: null }, 2, signal);
    expect(url).toContain('/anime/1535/episodes?page=2');
    expect(page).toEqual({ items: [{ episodeNumber: 1, title: 'Pilot', airedAt: '2026-10-01T00:00:00+00:00', synopsis: '', durationSeconds: null }], hasNextPage: false, total: 1 });
  });

  it('returns not_found when a MAL id is not available', async () => {
    const provider = createJikanEpisodeProvider(async () => { throw new Error('must not fetch'); }, async () => {});
    await expect(provider.listEpisodes({ ...lookup, externalIds: {}, providerUrl: null }, 1, signal)).rejects.toMatchObject({ kind: 'not_found' });
  });
});
