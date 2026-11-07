import { ProviderError, type EpisodeLookup, type EpisodePage, type EpisodeProvider, type EpisodeServer } from '../../metadata/types';
import type { FetchLike } from '../../metadata/providers/http';
import { createHiAnimeClient } from '../../hianime/client';
import { parseHiAnimeEpisodePayload, parseHiAnimeEpisodes, parseHiAnimeServers, parseHiAnimeSearch } from '../../hianime/parser';

const PAGE_SIZE = 50;
const ALLOWED_HOSTS = new Set(['hianime.at', 'hianimez.to', 'hianime.to', 'hianime.nz', 'hianime.sx', 'hianime.vc']);

function providerSlug(value: string | null | undefined): { slug: string; numericId: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;
    const slug = url.pathname.match(/\/watch\/([a-z0-9-]+)\/?$/i)?.[1];
    const numericId = slug?.match(/-(\d+)$/)?.[1];
    return slug && numericId ? { slug, numericId } : null;
  } catch { return null; }
}

export function createHiAnimeEpisodeProvider(fetchImpl: FetchLike, baseUrl?: string): EpisodeProvider {
  const client = createHiAnimeClient(fetchImpl, baseUrl);

  async function findTitle(lookup: EpisodeLookup, signal: AbortSignal): Promise<{ slug: string; numericId: string }> {
    const fromUrl = providerSlug(lookup.providerUrl);
    if (fromUrl) {
      return fromUrl;
    }
    const queries = [...new Set([lookup.title, ...lookup.alternateTitles].map((s) => s.trim()).filter(Boolean))].slice(0, 3);
    for (const query of queries) {
      const response = await client.get(`/search?keyword=${encodeURIComponent(query)}&page=1`, '/', signal);
      const normalized = query.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
      const match = parseHiAnimeSearch(response.text, response.baseUrl).find((item) => item.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') === normalized);
      if (match) return { slug: match.slug, numericId: match.id };
    }
    throw new ProviderError('not_found', 'HiAnime has no exact title match.');
  }

  async function loadEpisodeHtml(episodeId: string, slug: string, signal: AbortSignal) {
    const response = await client.get(`/api/theme/episode/list/${episodeId}`, `/watch/${slug}`, signal);
    let raw: unknown;
    try { raw = JSON.parse(response.text); }
    catch { raw = response.text; }
    return parseHiAnimeEpisodePayload(raw);
  }

  const provider: EpisodeProvider = {
    id: 'hianime',
    displayName: 'HiAnime episode catalogue',
    termsVerified: false,

    async listEpisodes(lookup, page, signal): Promise<EpisodePage> {
      if (!Number.isInteger(page) || page < 1 || page > 500) throw new ProviderError('invalid_response', 'Episode page is outside the supported range.');
      const match = await findTitle(lookup, signal);
      const html = await loadEpisodeHtml(match.numericId, match.slug, signal);
      const all = parseHiAnimeEpisodes(html);
      if (all.length === 0) throw new ProviderError('invalid_response', 'HiAnime episode HTML contained no valid episode links.');
      const start = (page - 1) * PAGE_SIZE;
      const selected = all.slice(start, start + PAGE_SIZE);
      return {
        items: selected.map((episode) => ({
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          airedAt: null,
          synopsis: episode.isFiller ? 'Filler episode.' : '',
          durationSeconds: null,
          providerEpisodeId: episode.providerEpisodeId,
        })),
        hasNextPage: start + PAGE_SIZE < all.length,
        total: all.length,
      };
    },

    async listServers(providerEpisodeId: string, lookup: EpisodeLookup, signal): Promise<EpisodeServer[]> {
      if (!/^\d+$/.test(providerEpisodeId)) throw new ProviderError('invalid_response', 'Invalid HiAnime episode id.');
      const match = await findTitle(lookup, signal);
      const response = await client.get(`/api/theme/episode/servers?episodeId=${encodeURIComponent(providerEpisodeId)}`, `/watch/${match.slug}`, signal);
      let raw: unknown;
      try { raw = JSON.parse(response.text); }
      catch { raw = response.text; }
      const html = parseHiAnimeEpisodePayload(raw);
      return parseHiAnimeServers(html).map((server) => ({ id: server.providerServerId, type: server.type, name: server.name }));
    },
  };
  return provider;
}
