import { parseHiAnimeEpisodes, parseHiAnimeEpisodePayload, parseHiAnimeSearch } from '../../hianime/parser';

export type HiAnimeSearchResult = { slug: string; numericId: string; title: string };

export function normalizeProviderTitle(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Backwards-compatible test/helper shape; the shared parser is also used by the catalogue adapter. */
export function parseHiAnimeSearchResults(html: string, baseUrl = 'https://hianime.at'): HiAnimeSearchResult[] {
  return parseHiAnimeSearch(html, baseUrl).map((item) => ({ slug: item.slug, numericId: item.id, title: item.title }));
}

export function parseHiAnimeEpisodeLinks(html: string) {
  return parseHiAnimeEpisodes(html).map(({ providerEpisodeId, episodeNumber, title }) => ({ providerEpisodeId, episodeNumber, title }));
}

export const parseHiAnimeEpisodeListPayload = parseHiAnimeEpisodePayload;
