import { ProviderError, type EpisodeLookup, type EpisodePage, type EpisodeProvider } from '../../metadata/types';
import { parseHiAnimeEpisodeLinks, parseHiAnimeEpisodeListPayload, parseHiAnimeSearchResults, normalizeProviderTitle } from '../parsers/hianime';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_BASE_URL = 'https://hianimez.to';
const ALLOWED_HOSTS = new Set(['hianimez.to', 'hianime.to', 'hianime.nz', 'hianime.sx', 'hianime.vc']);
const PAGE_SIZE = 50;
const MAX_RESPONSE_CHARS = 2_000_000;
const USER_AGENT = 'KAIRO/0.3 (+https://github.com/UnpainLlama/kairo)';

function resolveBaseUrl(raw?: string): URL {
  let url: URL;
  try { url = new URL(raw || DEFAULT_BASE_URL); }
  catch { throw new ProviderError('unavailable', 'HiAnime base URL is invalid.'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
    throw new ProviderError('unavailable', 'HiAnime base URL is not on the HTTPS host allowlist.');
  }
  return new URL(url.origin);
}

function normalizeStatus(response: Response): void {
  if (response.status === 404) throw new ProviderError('not_found', 'HiAnime has no matching title or episode list.');
  if (response.status === 429) {
    const retry = Number(response.headers.get('Retry-After'));
    throw new ProviderError('rate_limited', 'HiAnime rate limit was reached.', Number.isFinite(retry) && retry > 0 ? Math.min(retry, 600) : 60);
  }
  if (response.status === 403 || response.status >= 500) throw new ProviderError('unavailable', `HiAnime returned ${response.status}.`);
  if (!response.ok) throw new ProviderError('unavailable', `HiAnime returned ${response.status}.`);
}

export function createHiAnimeEpisodeProvider(fetchImpl: FetchLike, baseUrl?: string): EpisodeProvider {
  const base = resolveBaseUrl(baseUrl);

  async function fetchText(url: URL, referer: string, signal: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: {
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': USER_AGENT,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: referer,
        },
      });
    } catch {
      throw new ProviderError('unavailable', 'Could not reach HiAnime.');
    }
    normalizeStatus(response);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) throw new ProviderError('invalid_response', 'HiAnime response exceeded the parser size limit.');
    return text;
  }

  async function findSlug(lookup: EpisodeLookup, signal: AbortSignal): Promise<{ slug: string; numericId: string }> {
    const queries = [...new Set([lookup.title, ...lookup.alternateTitles].map((s) => s.trim()).filter(Boolean))].slice(0, 3);
    const targets = new Set(queries.map(normalizeProviderTitle).filter(Boolean));
    if (targets.size === 0) throw new ProviderError('not_found', 'No title was supplied for HiAnime search.');

    for (const query of queries) {
      const url = new URL('/search', base);
      url.searchParams.set('keyword', query);
      url.searchParams.set('page', '1');
      const html = await fetchText(url, `${base.origin}/`, signal);
      const exact = parseHiAnimeSearchResults(html, base.origin).find((result) => targets.has(normalizeProviderTitle(result.title)));
      if (exact) return { slug: exact.slug, numericId: exact.numericId };
    }
    throw new ProviderError('not_found', 'HiAnime has no exact title match.');
  }

  return {
    id: 'hianime',
    displayName: 'HiAnime episode catalogue',
    // The supplied documentation describes unofficial reverse-engineered endpoints and does not establish reuse rights.
    termsVerified: false,

    async listEpisodes(lookup, page, signal): Promise<EpisodePage> {
      if (!Number.isInteger(page) || page < 1 || page > 500) throw new ProviderError('invalid_response', 'Episode page is outside the supported range.');
      const match = await findSlug(lookup, signal);
      const url = new URL(`/ajax/v2/episode/list/${match.numericId}`, base);
      const raw = await fetchText(url, `${base.origin}/watch/${match.slug}`, signal);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch { throw new ProviderError('invalid_response', 'HiAnime episode-list endpoint did not return JSON.'); }

      const html = parseHiAnimeEpisodeListPayload(parsed);
      const all = parseHiAnimeEpisodeLinks(html);
      if (all.length === 0) throw new ProviderError('invalid_response', 'HiAnime episode-list HTML contained no valid episode links.');

      const start = (page - 1) * PAGE_SIZE;
      const selected = all.slice(start, start + PAGE_SIZE);
      return {
        items: selected.map((episode) => ({
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          airedAt: null,
          synopsis: '',
          durationSeconds: null,
        })),
        hasNextPage: start + PAGE_SIZE < all.length,
        total: all.length,
      };
    },
  };
}
