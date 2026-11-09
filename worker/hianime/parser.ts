import { ProviderError } from '../metadata/types';

export type HiAnimeCard = {
  id: string;
  slug: string;
  title: string;
  posterUrl: string | null;
  format: string | null;
  year: number | null;
  episodeCount: number | null;
  status: string | null;
};

export type HiAnimeDetail = HiAnimeCard & {
  synopsis: string;
  genres: string[];
  rating: number | null;
  bannerUrl: string | null;
  altTitles: string[];
};

export type HiAnimeEpisode = { providerEpisodeId: string; episodeNumber: number; title: string; isFiller: boolean };
export type HiAnimeServer = {
  providerServerId: string;
  type: 'sub' | 'dub' | 'raw';
  name: string;
  /** Provider-supplied base64 data-hash. Kept opaque; never treated as trusted URL input. */
  dataHash?: string;
  /** Plain HTTPS URL only when the public payload directly contains one. */
  embedUrl?: string;
};

/** Reversible, collision-free path-safe identifier for an opaque provider hash. */
export function stableServerIdFromHash(hash: string): string {
  return `h_${hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

/** Decode only a plainly encoded URL/JSON URL. No eval, decryption, or challenge bypass. */
export function decodeHiAnimeDataHash(hash: string): string | null {
  if (!hash || hash.length > 1800 || !/^[A-Za-z0-9_+\/-]+={0,2}$/.test(hash)) return null;
  try {
    const normalized = hash.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)).trim();
    let candidate = decoded;
    if (!/^https:\/\//i.test(candidate)) {
      const parsed: unknown = JSON.parse(decoded);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const root = parsed as Record<string, unknown>;
      const nested = root.link && typeof root.link === 'object' && !Array.isArray(root.link) ? root.link as Record<string, unknown> : null;
      candidate = (typeof root.link === 'string' ? root.link : '') || (typeof root.url === 'string' ? root.url : '') || (typeof root.file === 'string' ? root.file : '') || (typeof nested?.url === 'string' ? nested.url : '');
    }
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'").replace(/&#x0*27;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

export function parseAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of raw.matchAll(pattern)) {
    const name = (match[1] ?? '').toLowerCase();
    if (name) out[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return out;
}

export function textContent(raw: string): string {
  return decodeEntities(raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:div|p|span|li|small|strong|em|b|i|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')).replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Small balanced-tag extractor; avoids adding a DOM dependency to the Worker bundle. */
export function elementsByClass(html: string, className: string, tagName?: string): string[] {
  const out: string[] = [];
  const openTags = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  for (const match of html.matchAll(openTags)) {
    const tag = (match[1] ?? '').toLowerCase();
    if (tagName && tag !== tagName.toLowerCase()) continue;
    const attrs = parseAttributes(match[2] ?? '');
    if (!(attrs.class ?? '').split(/\s+/).includes(className)) continue;
    const start = (match.index ?? 0) + match[0].length;
    const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    token.lastIndex = start;
    let depth = 1;
    let end = -1;
    let next: RegExpExecArray | null;
    while ((next = token.exec(html))) {
      const isClose = /^<\//.test(next[0]);
      const selfClose = /\/>$/.test(next[0]);
      if (isClose) depth--;
      else if (!selfClose && !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag)) depth++;
      if (depth === 0) { end = next.index; break; }
    }
    if (end >= start) out.push(html.slice(match.index ?? 0, token.lastIndex));
  }
  return out;
}

function firstClass(html: string, names: string[]): string {
  for (const name of names) {
    const value = elementsByClass(html, name)[0];
    if (value !== undefined) return value;
  }
  return '';
}

function safeImage(raw: string | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function cardFromHtml(html: string, baseUrl: string): HiAnimeCard | null {
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  let chosen: { attrs: Record<string, string>; inner: string } | undefined;
  for (const match of anchors) {
    const attrs = parseAttributes(match[1] ?? '');
    if (attrs.href && /\/(?:watch\/)?[a-z0-9-]+-\d+\/?(?:[?#]|$)/i.test(attrs.href)) {
      chosen = { attrs, inner: match[2] ?? '' };
      if ((attrs.class ?? '').split(/\s+/).includes('film-name')) break;
    }
  }
  if (!chosen) return null;
  let url: URL;
  try { url = new URL(chosen.attrs.href!, baseUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== new URL(baseUrl).hostname) return null;
  const slug = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? '';
  const id = slug.match(/-(\d+)$/)?.[1];
  if (!id) return null;
  const title = chosen.attrs.title ?? chosen.attrs['data-name'] ?? textContent(chosen.inner);
  if (!title) return null;
  const imageMatch = html.match(/<img\b([^>]*)>/i);
  const imageAttrs = parseAttributes(imageMatch?.[1] ?? '');
  const info = textContent(firstClass(html, ['fd-infor', 'film-infor']));
  const format = /\b(movie|tv|ova|ona|special)\b/i.exec(info)?.[1] ?? null;
  const year = Number(info.match(/\b(19\d{2}|20\d{2})\b/)?.[1]);
  const eps = Number(info.match(/\b(\d+)\s*(?:eps?|episodes?)\b/i)?.[1]);
  const status = /\b(ongoing|completed|finished|upcoming)\b/i.exec(info)?.[1] ?? null;
  return { id, slug, title: textContent(title), posterUrl: safeImage(imageAttrs['data-src'] ?? imageAttrs['data-lazy-src'] ?? imageAttrs.src, baseUrl), format, year: Number.isInteger(year) && year > 1900 ? year : null, episodeCount: Number.isInteger(eps) && eps > 0 ? eps : null, status };
}

export function parseHiAnimeSearch(html: string, baseUrl: string): HiAnimeCard[] {
  const cards: HiAnimeCard[] = [];
  const seen = new Set<string>();
  for (const cardHtml of elementsByClass(html, 'flw-item')) {
    const card = cardFromHtml(cardHtml, baseUrl);
    if (card && !seen.has(card.id)) { seen.add(card.id); cards.push(card); }
  }
  if (cards.length === 0) {
    for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const attrs = parseAttributes(match[1] ?? '');
      const card = cardFromHtml(`<a href="${(attrs.href ?? '').replace(/"/g, '&quot;')}" title="${(attrs.title ?? '').replace(/"/g, '&quot;')}">${match[2] ?? ''}</a>`, baseUrl);
      if (card && !seen.has(card.id)) { seen.add(card.id); cards.push(card); }
    }
  }
  return cards;
}

export function parseHiAnimeDetail(html: string, baseUrl: string, fallbackSlug?: string): HiAnimeDetail {
  const nameBlock = firstClass(html, ['film-name']);
  const titleMatch = html.match(/<meta\b(?=[^>]*property=["']og:title["'])[^>]*content=["']([^"']+)/i);
  const title = textContent(nameBlock) || (titleMatch ? decodeEntities(titleMatch[1]!) : '');
  const slug = fallbackSlug ?? html.match(/(?:\/watch\/)([a-z0-9-]+)(?:["'/?#])/i)?.[1] ?? '';
  const id = slug.match(/-(\d+)$/)?.[1];
  if (!title || !id) throw new ProviderError('invalid_response', 'HiAnime detail page did not contain a title and numeric slug.');
  const infoHtml = firstClass(html, ['anisc-info']);
  const infoText = textContent(infoHtml);
  const description = firstClass(html, ['film-description']);
  const synopsis = textContent(description).replace(/^(?:Overview|Synopsis)\s*/i, '');
  const genreLinks = [...infoHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => {
    const attrs = parseAttributes(m[1] ?? '');
    const href = attrs.href ?? '';
    return /\/genre\//i.test(href) ? textContent(m[2] ?? '') : '';
  }).filter(Boolean);
  const posterBlock = firstClass(html, ['anisc-poster']);
  const posterMatch = posterBlock.match(/<img\b([^>]*)>/i);
  const posterAttrs = parseAttributes(posterMatch?.[1] ?? '');
  const metaImage = html.match(/<meta\b(?=[^>]*property=["']og:image["'])[^>]*content=["']([^"']+)/i)?.[1];
  const tickText = textContent(firstClass(html, ['film-stats', 'anisc-detail']));
  const year = Number(infoText.match(/\b(19\d{2}|20\d{2})\b/)?.[1] ?? tickText.match(/\b(19\d{2}|20\d{2})\b/)?.[1]);
  const episodeCount = Number(tickText.match(/\b(\d+)\s*(?:eps?|episodes?)\b/i)?.[1]);
  const ratingRaw = tickText.match(/\b(?:score|rating)\s*[:·-]?\s*(\d(?:\.\d)?)/i)?.[1];
  const rating = ratingRaw ? Number(ratingRaw) : null;
  const type = /\b(movie|tv|ova|ona|special)\b/i.exec(infoText)?.[1] ?? null;
  const status = /\b(ongoing|currently airing|completed|finished|upcoming|not yet aired)\b/i.exec(infoText)?.[1] ?? null;
  const alt = html.match(/<div\b[^>]*class=["'][^"']*film-name[^"']*["'][^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const altTitles = alt ? [textContent(alt)] : [];
  const posterUrl = safeImage(posterAttrs['data-src'] ?? posterAttrs['data-lazy-src'] ?? posterAttrs.src ?? metaImage, baseUrl);
  return {
    id, slug, title: textContent(title), posterUrl, format: type, year: Number.isInteger(year) && year > 1900 ? year : null,
    episodeCount: Number.isInteger(episodeCount) && episodeCount > 0 ? episodeCount : null, status,
    synopsis, genres: [...new Set(genreLinks)], rating: rating !== null && Number.isFinite(rating) && rating >= 0 && rating <= 10 ? rating : null,
    bannerUrl: null, altTitles,
  };
}

export function parseHiAnimeEpisodePayload(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim().startsWith('<')) return raw;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ProviderError('invalid_response', 'HiAnime episode endpoint returned an unexpected body.');
  const body = raw as Record<string, unknown>;
  const data = body.data;
  const result = body.result;
  const candidates = [body.html, typeof data === 'string' ? data : undefined, (data as Record<string, unknown> | undefined)?.html, typeof result === 'string' ? result : undefined, (result as Record<string, unknown> | undefined)?.html];
  const html = candidates.find((value): value is string => typeof value === 'string' && value.length > 0);
  if (typeof body.status === 'boolean' && body.status === false) throw new ProviderError('not_found', 'HiAnime has no episode list for this title.');
  if (!html) throw new ProviderError('invalid_response', 'HiAnime episode response did not contain HTML.');
  return html;
}

export function parseHiAnimeEpisodes(html: string): HiAnimeEpisode[] {
  const out: HiAnimeEpisode[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = parseAttributes(match[1] ?? '');
    if (!(attrs.class ?? '').split(/\s+/).includes('ep-item')) continue;
    const id = attrs['data-id'];
    const number = Number(attrs['data-number'] ?? textContent(match[2] ?? '').match(/(?:episode|ep)\s*(\d+(?:\.\d+)?)/i)?.[1]);
    if (!id || !/^\d+$/.test(id) || !Number.isFinite(number) || number <= 0 || seen.has(id)) continue;
    const title = attrs.title ?? attrs['data-title'] ?? (textContent(match[2] ?? '') || `Episode ${number}`);
    out.push({ providerEpisodeId: id, episodeNumber: number, title, isFiller: /filler/i.test(attrs.class ?? '') });
    seen.add(id);
  }
  return out.sort((a, b) => a.episodeNumber - b.episodeNumber);
}

export function parseHiAnimeServers(html: string): HiAnimeServer[] {
  const out: HiAnimeServer[] = [];
  const seen = new Set<string>();
  for (const item of elementsByClass(html, 'server-item')) {
    const opening = item.match(/^\s*<[^>]+>/)?.[0] ?? '';
    const attrs = parseAttributes(opening);
    const type = (attrs['data-type'] ?? '').toLowerCase();
    if (!['sub', 'dub', 'raw'].includes(type)) continue;

    const dataHash = (attrs['data-hash'] ?? '').trim();
    const legacyId = attrs['data-id'] ?? attrs['data-server-id'];
    const id = dataHash
      ? stableServerIdFromHash(dataHash)
      : legacyId && /^\d+$/.test(legacyId) ? legacyId : '';
    if (!id || seen.has(`${type}:${id}`)) continue;

    const body = item.slice(opening.length, item.lastIndexOf('</'));
    const label = attrs['data-server-name'] || attrs.title || textContent(body);
    const fallbackNumber = attrs['data-server-id'] && /^\d+$/.test(attrs['data-server-id']) ? attrs['data-server-id'] : String(out.length + 1);
    const name = textContent(label) || `HD-${fallbackNumber}`;
    const embedUrl = dataHash ? decodeHiAnimeDataHash(dataHash) ?? undefined : undefined;
    out.push({
      providerServerId: id,
      type: type as HiAnimeServer['type'],
      name,
      ...(dataHash ? { dataHash } : {}),
      ...(embedUrl ? { embedUrl } : {}),
    });
    seen.add(`${type}:${id}`);
  }
  return out;
}
