import { normalizeFormat, normalizeStatus, plainText } from '../metadata/normalize';
import { ProviderError, type Attribution } from '../metadata/types';
import type { FetchLike } from '../metadata/providers/http';
import { createHiAnimeClient } from '../hianime/client';
import { parseAttributes, parseHiAnimeDetail, parseHiAnimeSearch, textContent, type HiAnimeCard, type HiAnimeDetail } from '../hianime/parser';
import type { Ref } from './ids';
import { makeId, slugify } from './ids';
import type { BrowseQuery, CatalogSource, ListKind, LiveTitle, Paged } from './types';

const MAX_LIMIT = 24;

export const HIANIME_ATTRIBUTION: Attribution = {
  providerId: 'hianime',
  displayName: 'HiAnime',
  text: 'Catalogue information is retrieved from the HiAnime website. KAIRO is an independent project and is not affiliated with HiAnime.',
  url: 'https://hianime.at',
  termsUrl: 'https://hianime.at',
  license: null,
  requirements: [
    'This adapter uses public website pages and documented AJAX.',
  ],
};

function statusValue(raw: string | null) {
  if (!raw) return null;
  if (/ongoing|currently airing/i.test(raw)) return 'airing' as const;
  if (/completed|finished/i.test(raw)) return 'finished' as const;
  if (/upcoming|not yet aired/i.test(raw)) return 'upcoming' as const;
  return normalizeStatus(raw);
}

function formatValue(raw: string | null) {
  if (!raw) return null;
  return normalizeFormat(raw);
}

function toLiveTitle(card: HiAnimeCard | HiAnimeDetail, url: string, altTitles: string[] = []): LiveTitle {
  const id = Number(card.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ProviderError('invalid_response', 'HiAnime returned an invalid anime id.');
  const title = card.title || 'Untitled';
  const cardSlug = `${card.slug}-h${id}`;
  const detail = card as Partial<HiAnimeDetail>;
  return {
    card: {
      id: makeId('h', id),
      slug: cardSlug,
      title,
      synopsis: plainText(detail.synopsis) ?? '',
      posterUrl: card.posterUrl,
      bannerUrl: detail.bannerUrl ?? null,
      format: formatValue(card.format),
      releaseYear: card.year,
      season: null,
      status: statusValue(card.status),
      rating: detail.rating ?? null,
      episodeCount: card.episodeCount,
      genres: detail.genres ?? [],
    },
    altTitles: [...new Set([...altTitles, ...(detail.altTitles ?? [])])].filter((value) => value && value.toLowerCase() !== title.toLowerCase()).slice(0, 12),
    malId: null,
    anilistId: null,
    url,
    provider: 'hianime',
  };
}

function slugFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['hianime.at', 'hianimez.to', 'hianime.to', 'hianime.nz', 'hianime.sx', 'hianime.vc'].includes(url.hostname)) return null;
    const match = url.pathname.match(/\/watch\/([a-z0-9-]+)\/?$/i);
    return match?.[1] ?? null;
  } catch { return null; }
}

export function createHiAnimeSource(fetchImpl: FetchLike, baseUrl?: string): CatalogSource {
  const client = createHiAnimeClient(fetchImpl, baseUrl);

  async function search(query: string, page: number, signal: AbortSignal): Promise<{ cards: HiAnimeCard[]; baseUrl: string }> {
    const path = `/search?keyword=${encodeURIComponent(query)}&page=${page}`;
    const response = await client.get(path, '/', signal);
    const cards = parseHiAnimeSearch(response.text, response.baseUrl);
    if (cards.length === 0 && !/no results|nothing found|no anime found/i.test(response.text)) throw new ProviderError('invalid_response', 'HiAnime search did not contain recognizable result cards.');
    return { cards, baseUrl: response.baseUrl };
  }

  async function getDetail(slug: string, signal: AbortSignal): Promise<{ detail: HiAnimeDetail; url: string }> {
    if (!/^[a-z0-9-]+-\d+$/i.test(slug)) throw new ProviderError('not_found', 'HiAnime slug is invalid.');
    const response = await client.get(`/watch/${encodeURIComponent(slug)}`, `/watch/${encodeURIComponent(slug)}`, signal);
    const detail = parseHiAnimeDetail(response.text, response.baseUrl, slug);
    return { detail, url: `${response.baseUrl}/watch/${slug}` };
  }

  async function resolveSlug(ref: Ref, signal: AbortSignal): Promise<string> {
    const fromRoute = slugFromUrl(ref.slug ? `https://hianime.at/watch/${ref.slug}` : null);
    if (fromRoute) return fromRoute;
    const found = await search(String(ref.id), 1, signal);
    const match = found.cards.find((card) => Number(card.id) === ref.id);
    if (!match) throw new ProviderError('not_found', 'HiAnime has no matching title.');
    return match.slug;
  }

  async function cardsForPath(path: string, page: number, limit: number, signal: AbortSignal): Promise<Paged> {
    const response = await client.get(`${path}?page=${page}`, '/', signal);
    const all = parseHiAnimeSearch(response.text, response.baseUrl);
    if (all.length === 0 && !/no results|nothing found|no anime found/i.test(response.text)) throw new ProviderError('invalid_response', 'HiAnime category page did not contain recognizable anime cards.');
    const items = all.slice(0, limit).map((card) => toLiveTitle(card, `${response.baseUrl}/watch/${card.slug}`));
    return { items, total: null, hasNextPage: all.length >= limit, limit };
  }

  return {
    id: 'hianime',
    displayName: 'HiAnime',
    attribution: HIANIME_ATTRIBUTION,
    maxLimit: MAX_LIMIT,
    supports: (ref: Ref) => ref.kind === 'h',

    async list(kind: ListKind, page, limit, signal) {
      const n = Math.min(Math.max(limit, 1), MAX_LIMIT);
      if (kind === 'featured') return cardsForPath('/most-popular', 1, Math.min(n, 12), signal);
      if (kind === 'trending') return cardsForPath('/top-airing', page, n, signal);
      return cardsForPath('/recently-updated', page, n, signal);
    },

    async browse(q: BrowseQuery, signal) {
      const n = Math.min(Math.max(q.limit, 1), MAX_LIMIT);
      if (q.status === 'hiatus') return { items: [], total: 0, hasNextPage: false, limit: n };
      let result: Paged;
      if (q.q?.trim()) {
        const found = await search(q.q.trim().slice(0, 100), q.page, signal);
        result = { items: found.cards.map((card) => toLiveTitle(card, `${found.baseUrl}/watch/${card.slug}`)), total: null, hasNextPage: found.cards.length >= n, limit: n };
      } else {
        const path = q.genre ? `/genre/${slugify(q.genre)}`
          : q.format === 'movie' ? '/movie/'
          : q.format === 'series' ? '/tv/'
          : q.status === 'finished' ? '/latest-completed'
          : q.status === 'upcoming' ? '/new-anime'
          : q.status === 'airing' ? '/top-airing'
          : q.sort === 'latest' ? '/recently-updated'
          : q.sort === 'rating' ? '/most-favorite' : '/most-popular';
        result = await cardsForPath(path, q.page, n, signal);
      }
      // Search/category cards do not always expose every filter field. Apply a filter only
      // when the upstream card actually supplied that field; unknown values are not guessed.
      const filtered = result.items.filter((item) => {
        const c = item.card;
        if (q.genre && c.genres.length > 0 && !c.genres.some((g) => g.toLowerCase() === q.genre!.toLowerCase())) return false;
        if (q.year !== undefined && c.releaseYear !== null && c.releaseYear !== q.year) return false;
        if (q.format && c.format !== null && c.format !== q.format) return false;
        if (q.status && c.status !== null && c.status !== q.status) return false;
        if (q.season && c.season !== null && c.season !== q.season) return false;
        return true;
      });
      return { ...result, items: filtered, total: result.total === null ? null : filtered.length, hasNextPage: result.hasNextPage || filtered.length >= n };
    },

    async genres(signal) {
      const response = await client.get('/', '/', signal);
      const genres: { name: string; count: number }[] = [];
      const seen = new Set<string>();
      for (const match of response.text.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const attrs = parseAttributes(match[1] ?? '');
        if (!/\/genre\//i.test(attrs.href ?? '')) continue;
        const name = textContent(match[2] ?? '');
        if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); genres.push({ name, count: 0 }); }
      }
      return genres;
    },

    async byRef(ref, signal) {
      if (ref.kind !== 'h') throw new ProviderError('not_found', 'HiAnime only resolves HiAnime ids.');
      const slug = await resolveSlug(ref, signal);
      const { detail, url } = await getDetail(slug, signal);
      if (Number(detail.id) !== ref.id) throw new ProviderError('not_found', 'HiAnime slug did not match the requested id.');
      return toLiveTitle(detail, url, detail.altTitles);
    },

    async related(ref, limit, signal) {
      if (ref.kind !== 'h') throw new ProviderError('not_found', 'HiAnime only resolves HiAnime ids.');
      const slug = await resolveSlug(ref, signal);
      const response = await client.get(`/watch/${encodeURIComponent(slug)}`, `/watch/${encodeURIComponent(slug)}`, signal);
      const cards = parseHiAnimeSearch(response.text, response.baseUrl).filter((card) => Number(card.id) !== ref.id).slice(0, Math.min(limit, 24));
      return cards.map((card) => toLiveTitle(card, `${response.baseUrl}/watch/${card.slug}`));
    },
  };
}
