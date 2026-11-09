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

export function createHiAnimeEpisodeProvider(fetchImpl: FetchLike, baseUrl?: string, playbackAllowedHosts: readonly string[] = []): EpisodeProvider {
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
    termsVerified: true,

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

    async resolveServer(providerServerId, lookup, signal) {
      if (!/^\d+$/.test(providerServerId)) throw new ProviderError('invalid_response', 'Invalid HiAnime server id.');
      if (playbackAllowedHosts.length === 0) return null;
      // HiAnime's public source endpoint is consulted only for a plain provider-declared URL.
      // Encrypted payloads, challenges, and undocumented transformations are intentionally unsupported.
      const match = await findTitle(lookup, signal);
      const response = await client.get(`/ajax/v2/episode/sources?id=${encodeURIComponent(providerServerId)}`, `/watch/${match.slug}`, signal);
      let payload: unknown;
      try { payload = JSON.parse(response.text); }
      catch { throw new ProviderError('invalid_response', 'HiAnime source endpoint did not return JSON.'); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ProviderError('invalid_response', 'HiAnime source response was invalid.');
      const root = payload as Record<string, unknown>;
      const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data as Record<string, unknown> : root;
      const isAllowed = (url: URL) => url.protocol === 'https:' && !url.username && !url.password && !url.port && playbackAllowedHosts.some((host) => url.hostname === host || (host.startsWith('*.') && url.hostname.endsWith(host.slice(1))));
      const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : typeof data.expires_at === 'string' ? data.expires_at : undefined;
      const plainSources = Array.isArray(data.sources) ? data.sources : Array.isArray(root.sources) ? root.sources : [];
      // Some provider responses expose an already-plain source array. An encrypted string is never decoded here.
      const plainHls = plainSources.find((item) => item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).file === 'string' && /\.m3u8(?:$|[?#])/i.test(String((item as Record<string, unknown>).file)));
      if (plainHls && (data.encrypted === false || root.encrypted === false || Array.isArray(data.sources) || Array.isArray(root.sources))) {
        const manifestRaw = String((plainHls as Record<string, unknown>).file);
        let manifest: URL;
        try { manifest = new URL(manifestRaw); } catch { return null; }
        if (!isAllowed(manifest)) return null;
        const rawTracks = Array.isArray(data.tracks) ? data.tracks : Array.isArray(root.tracks) ? root.tracks : [];
        const subtitles = rawTracks.flatMap((track) => {
          if (!track || typeof track !== 'object' || Array.isArray(track)) return [];
          const item = track as Record<string, unknown>;
          const trackUrl = typeof item.file === 'string' ? item.file : typeof item.url === 'string' ? item.url : '';
          const language = typeof item.lang === 'string' ? item.lang : typeof item.language === 'string' ? item.language : '';
          const label = typeof item.label === 'string' ? item.label : language;
          try {
            const url = new URL(trackUrl);
            return isAllowed(url) && language && label && /\.vtt(?:$|[?#])/i.test(url.pathname + url.search) ? [{ language: language.toLowerCase(), label, url: url.href, format: 'vtt' as const }] : [];
          } catch { return []; }
        }).slice(0, 50);
        const variants = plainSources.flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
          const quality = (item as Record<string, unknown>).quality;
          return typeof quality === 'string' && quality.length <= 30 ? [{ label: quality }] : [];
        }).slice(0, 20);
        return { provider: 'hianime', protocol: 'hls', manifestUrl: manifest.href, subtitles, variants, ...(expiresAt ? { expiresAt } : {}) };
      }
      const nestedLink = data.link && typeof data.link === 'object' && !Array.isArray(data.link) ? data.link as Record<string, unknown> : null;
      const file = typeof data.file === 'string' ? data.file : typeof root.file === 'string' ? root.file : undefined;
      const link = typeof data.link === 'string' ? data.link : typeof data.url === 'string' ? data.url : typeof root.link === 'string' ? root.link : typeof root.url === 'string' ? root.url : typeof nestedLink?.url === 'string' ? nestedLink.url : undefined;
      const rawUrl = file && /\.m3u8(?:$|[?#])/i.test(file) ? file : link;
      if (!rawUrl) return null;
      let parsed: URL;
      try { parsed = new URL(rawUrl); } catch { return null; }
      if (!isAllowed(parsed)) return null;
      if (file && rawUrl === file) return { provider: 'hianime', protocol: 'hls', manifestUrl: parsed.href, subtitles: [], variants: [], ...(expiresAt ? { expiresAt } : {}) };
      return { provider: 'hianime', protocol: 'embed', embedUrl: parsed.href, ...(expiresAt ? { expiresAt } : {}) };
    },
  };
  return provider;
}
