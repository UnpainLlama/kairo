// Kitsu adapter (JSON:API, https://kitsu.io/api/edge). Public reads are reported to need no key by third-party client docs, but
// Kitsu's own terms and rate limits were NOT verified from a primary source (kitsu.io/terms could not be fetched), so
// termsVerified = false and this provider is off unless METADATA_PROVIDERS names it. Field names follow the community-maintained
// Kitsu API docs (hummingbird-me/api-docs); live responses must be checked on first use. Unknown shapes fail closed.
// Kitsu is used for metadata only. It is NOT assumed to provide episode lists or streams.
import { httpsUrlOrNull, normalizeFormat, normalizeStatus, plainText, positiveInt, ratingFrom100, uniqueStrings, yearOrNull } from '../normalize';
import { ProviderError, type Attribution, type MetadataProvider, type NormalizedMetadata } from '../types';
import { asString, isObject, providerFetch, readJson, USER_AGENT, type FetchLike } from './http';

const BASE = 'https://kitsu.io/api/edge';

export const KITSU_ATTRIBUTION: Attribution = {
  providerId: 'kitsu',
  displayName: 'Kitsu',
  text: 'Anime details from Kitsu. KAIRO is an unofficial, personal project and is not affiliated with Kitsu.',
  url: 'https://kitsu.io',
  termsUrl: 'https://kitsu.io/terms',
  license: null,
  requirements: ['Terms not yet verified from a primary source. Read them before enabling this provider.'],
};

export function mapKitsuAnime(resource: unknown, included: unknown[], fetchedAt: string): NormalizedMetadata {
  if (!isObject(resource) || !isObject(resource.attributes)) throw new ProviderError('invalid_response', 'Kitsu returned an unexpected resource shape.');
  const a = resource.attributes;
  const id = positiveInt(resource.id);
  if (id === null) throw new ProviderError('invalid_response', 'Kitsu resource has no valid id.');
  const titles = isObject(a.titles) ? a.titles : {};
  const poster = isObject(a.posterImage) ? a.posterImage : {};
  const cover = isObject(a.coverImage) ? a.coverImage : {};

  const categoryIds = new Set<string>();
  const rel = isObject(resource.relationships) && isObject(resource.relationships.categories) ? resource.relationships.categories : null;
  if (rel && Array.isArray(rel.data)) for (const d of rel.data) if (isObject(d) && typeof d.id === 'string') categoryIds.add(d.id);
  const genres = included
    .filter((i): i is Record<string, unknown> => isObject(i) && i.type === 'categories' && typeof i.id === 'string' && categoryIds.has(i.id))
    .map((i) => (isObject(i.attributes) ? asString(i.attributes.title) : null));

  const english = asString(titles.en);
  const romaji = asString(titles.en_jp);
  const native = asString(titles.ja_jp);
  const startYear = typeof a.startDate === 'string' ? yearOrNull(Number(a.startDate.slice(0, 4))) : null;
  return {
    provider: 'kitsu',
    externalId: String(id),
    ids: { kitsu: String(id) },
    url: asString(a.slug) ? `https://kitsu.io/anime/${encodeURIComponent(String(a.slug))}` : null,
    title: asString(a.canonicalTitle) ?? english ?? romaji ?? native,
    titleEnglish: english,
    titleRomaji: romaji,
    titleNative: native,
    synonyms: uniqueStrings(Array.isArray(a.abbreviatedTitles) ? a.abbreviatedTitles : []),
    synopsis: plainText(a.synopsis),
    format: normalizeFormat(a.subtype),
    status: normalizeStatus(a.status),
    season: null, // Kitsu has no explicit season field; one is never inferred from the start month
    year: startYear,
    episodeCount: positiveInt(a.episodeCount),
    genres: uniqueStrings(genres),
    posterUrl: httpsUrlOrNull(poster.original) ?? httpsUrlOrNull(poster.large),
    bannerUrl: httpsUrlOrNull(cover.original) ?? httpsUrlOrNull(cover.large),
    rating: ratingFrom100(a.averageRating),
    fetchedAt,
  };
}

export function createKitsuProvider(fetchImpl: FetchLike, now: () => string = () => new Date().toISOString()): MetadataProvider {
  async function get(path: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    const res = await providerFetch(fetchImpl, `${BASE}${path}`, { method: 'GET', headers: { Accept: 'application/vnd.api+json', 'User-Agent': USER_AGENT }, signal }, 'kitsu.io');
    if (res.status === 404) throw new ProviderError('not_found', 'Kitsu has no matching title.');
    if (!res.ok) throw new ProviderError('unavailable', `Kitsu returned ${res.status}.`);
    const body = await readJson(res);
    if (!isObject(body)) throw new ProviderError('invalid_response', 'Kitsu returned an unexpected body.');
    return body;
  }
  return {
    id: 'kitsu',
    displayName: 'Kitsu',
    capabilities: { byId: true, search: true },
    attribution: KITSU_ATTRIBUTION,
    termsVerified: false,
    async fetchById(externalId, signal) {
      const id = positiveInt(externalId);
      if (id === null) throw new ProviderError('not_found', 'Not a valid Kitsu id.');
      const body = await get(`/anime/${id}?include=categories`, signal);
      return mapKitsuAnime(body.data, Array.isArray(body.included) ? body.included : [], now());
    },
    async search(title, signal, limit = 8) {
      const q = new URLSearchParams({ 'filter[text]': title.slice(0, 100), 'page[limit]': String(Math.min(Math.max(limit, 1), 20)), include: 'categories' });
      const body = await get(`/anime?${q.toString()}`, signal);
      const fetchedAt = now();
      const included = Array.isArray(body.included) ? body.included : [];
      const data = Array.isArray(body.data) ? body.data : [];
      return data.flatMap((d) => { try { return [mapKitsuAnime(d, included, fetchedAt)]; } catch { return []; } });
    },
  };
}
