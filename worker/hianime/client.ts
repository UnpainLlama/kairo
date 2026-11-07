import { ProviderError } from '../metadata/types';
import type { FetchLike } from '../metadata/providers/http';

/** Known public mirrors. hianime.at is the base used by the supplied CloudStream extension. */
export const HIANIME_MIRRORS = [
  'https://hianime.at',
  'https://hianimez.to',
  'https://hianime.to',
  'https://hianime.nz',
  'https://hianime.sx',
  'https://hianime.vc',
] as const;

const ALLOWED_HOSTS = new Set(HIANIME_MIRRORS.map((value) => new URL(value).hostname));
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_RESPONSE_CHARS = 2_000_000;

export type HiAnimeResponse = { text: string; baseUrl: string; url: string };

function normalizeBase(raw?: string): string {
  let url: URL;
  try { url = new URL(raw || HIANIME_MIRRORS[0]); }
  catch { throw new ProviderError('unavailable', 'HiAnime base URL is invalid.'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new ProviderError('unavailable', 'HiAnime base URL is not on the HTTPS mirror allowlist.');
  }
  return url.origin;
}

function isChallengePage(text: string): boolean {
  return /<title>\s*(just a moment|attention required|access denied)\s*<\/title>|cf-chl-|challenge-platform/i.test(text.slice(0, 30_000));
}

/** Fetches only fixed, allowlisted HTTPS mirrors and rotates on mirror/network failures. */
export function createHiAnimeClient(fetchImpl: FetchLike, configuredBaseUrl?: string) {
  const preferred = normalizeBase(configuredBaseUrl);
  const bases = [preferred, ...HIANIME_MIRRORS.filter((base) => base !== preferred)];

  return {
    async get(path: string, refererPath: string, signal: AbortSignal): Promise<HiAnimeResponse> {
      if (!path.startsWith('/') || path.startsWith('//')) throw new ProviderError('invalid_response', 'Invalid HiAnime path.');
      let lastError: ProviderError = new ProviderError('unavailable', 'No HiAnime mirror could be reached.');
      for (const base of bases) {
        const url = new URL(path, base);
        try {
          const response = await fetchImpl(url.toString(), {
            method: 'GET',
            redirect: 'manual',
            signal,
            headers: {
              Accept: 'application/json, text/javascript, text/html, */*; q=0.01',
              'Accept-Language': 'en-US,en;q=0.9',
              'User-Agent': USER_AGENT,
              'X-Requested-With': 'XMLHttpRequest',
              Origin: base,
              Referer: new URL(refererPath, base).toString(),
            },
          });
          if (response.url) {
            let finalUrl: URL;
            try { finalUrl = new URL(response.url); }
            catch { throw new ProviderError('invalid_response', 'HiAnime returned an invalid redirect URL.'); }
            if (finalUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(finalUrl.hostname.toLowerCase())) {
              throw new ProviderError('unavailable', 'HiAnime redirected outside the configured mirror allowlist.');
            }
          }
          if (response.status === 404) { lastError = new ProviderError('not_found', 'The requested HiAnime page was not found on this mirror.'); continue; }
          if (response.status === 429) {
            const retry = Number(response.headers.get('Retry-After'));
            throw new ProviderError('rate_limited', 'HiAnime rate limit was reached.', Number.isFinite(retry) && retry > 0 ? Math.min(retry, 600) : 60);
          }
          if (!response.ok) { lastError = new ProviderError('unavailable', `HiAnime mirror returned HTTP ${response.status}.`); continue; }
          const text = await response.text();
          if (text.length > MAX_RESPONSE_CHARS) { lastError = new ProviderError('invalid_response', 'HiAnime response exceeded the parser size limit.'); continue; }
          if (isChallengePage(text)) { lastError = new ProviderError('unavailable', 'HiAnime returned an anti-bot challenge page.'); continue; }
          return { text, baseUrl: base, url: response.url || url.toString() };
        } catch (error) {
          if (error instanceof ProviderError && error.kind === 'rate_limited') throw error;
          lastError = error instanceof ProviderError ? error : new ProviderError('unavailable', 'Could not reach this HiAnime mirror.');
        }
      }
      throw lastError;
    },
  };
}
