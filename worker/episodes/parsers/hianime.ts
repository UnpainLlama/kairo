import { ProviderError } from '../../metadata/types';

export type HiAnimeSearchResult = { slug: string; numericId: string; title: string };

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_match, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function attributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of raw.matchAll(pattern)) {
    const name = (match[1] ?? '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (name) out[name] = decodeHtml(value);
  }
  return out;
}

function textContent(raw: string): string {
  return decodeHtml(raw
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:div|p|span|li|small|strong|em|b|i)>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeProviderTitle(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/**
 * Extracts only links with a HiAnime-style numeric slug. It deliberately avoids guessing
 * when a search card has no identifiable title or numeric slug.
 */
export function parseHiAnimeSearchResults(html: string, baseUrl = 'https://hianimez.to'): HiAnimeSearchResult[] {
  const results: HiAnimeSearchResult[] = [];
  const seen = new Set<string>();
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchors)) {
    const attrs = attributes(match[1] ?? '');
    const href = attrs.href;
    if (!href) continue;

    let url: URL;
    try { url = new URL(href, baseUrl); } catch { continue; }
    if (url.origin !== new URL(baseUrl).origin) continue;

    const path = url.pathname.replace(/\/+$/, '');
    const slugMatch = /(?:^|\/)(?:watch\/)?([a-z0-9-]+)$/i.exec(path);
    const slug = slugMatch?.[1];
    const numericId = slug?.match(/-(\d+)$/)?.[1];
    if (!slug || !numericId || seen.has(slug)) continue;

    const title = attrs.title ?? attrs['data-name'] ?? attrs['data-jname'] ?? textContent(match[2] ?? '');
    if (!title) continue;
    seen.add(slug);
    results.push({ slug, numericId, title });
  }
  return results;
}

/** Parse the documented `a.ep-item` / `.ssl-item.ep-item` links from the AJAX HTML. */
export function parseHiAnimeEpisodeLinks(html: string): { providerEpisodeId: string; episodeNumber: number; title: string }[] {
  const items: { providerEpisodeId: string; episodeNumber: number; title: string }[] = [];
  const seen = new Set<string>();
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchors)) {
    const attrs = attributes(match[1] ?? '');
    const classes = (attrs.class ?? '').split(/\s+/);
    if (!classes.includes('ep-item')) continue;

    const providerEpisodeId = attrs['data-id'];
    const episodeNumber = Number(attrs['data-number']);
    if (!providerEpisodeId || !/^\d+$/.test(providerEpisodeId) || !Number.isFinite(episodeNumber) || episodeNumber <= 0) continue;
    if (seen.has(providerEpisodeId)) continue;

    const title = attrs.title ?? attrs['data-title'] ?? textContent(match[2] ?? '') ?? '';
    seen.add(providerEpisodeId);
    items.push({ providerEpisodeId, episodeNumber, title: title || `Episode ${episodeNumber}` });
  }

  return items.sort((a, b) => a.episodeNumber - b.episodeNumber);
}

export function parseHiAnimeEpisodeListPayload(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProviderError('invalid_response', 'HiAnime returned an unexpected episode-list body.');
  }
  const body = raw as Record<string, unknown>;
  if (body.status !== true || typeof body.html !== 'string') {
    throw new ProviderError('invalid_response', 'HiAnime did not return the documented episode-list response.');
  }
  return body.html;
}
