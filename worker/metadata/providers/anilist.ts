// AniList adapter (GraphQL, https://graphql.anilist.co, no API key for public reads).
// Terms read on 2026-11-06 (docs.anilist.co/guide/terms-of-use): free for non-commercial use; the API must not be used as a backup or
// data store; hoarding/mass collection is prohibited; "AniList" must not be used alone as an app name. Rate limit: 90 requests/minute
// (some docs pages warn of a temporary 30/minute degraded mode). Hence: on-demand, per title, short-lived cache, no bulk import.
import { httpsUrlOrNull, normalizeFormat, normalizeSeason, normalizeStatus, plainText, positiveInt, ratingFrom100, uniqueStrings, yearOrNull } from '../normalize';
import { ProviderError, type Attribution, type MetadataProvider, type NormalizedMetadata } from '../types';
import { asString, isObject, providerFetch, readJson, USER_AGENT, type FetchLike } from './http';

const ENDPOINT = 'https://graphql.anilist.co';
const FIELDS = `id idMal siteUrl title { romaji english native } synonyms description(asHtml: false) format status episodes season seasonYear
  startDate { year } genres averageScore coverImage { extraLarge large } bannerImage`;
const BY_ID = `query ($id: Int) { Media(id: $id, type: ANIME) { ${FIELDS} } }`;
const SEARCH = `query ($search: String, $perPage: Int) { Page(page: 1, perPage: $perPage) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${FIELDS} } } }`;

export const ANILIST_ATTRIBUTION: Attribution = {
  providerId: 'anilist',
  displayName: 'AniList',
  text: 'Anime details from AniList. KAIRO is an unofficial, personal project and is not affiliated with AniList.',
  url: 'https://anilist.co',
  termsUrl: 'https://docs.anilist.co/guide/terms-of-use',
  license: null,
  requirements: [
    'Free for non-commercial use.',
    'Do not use the API as a backup or data storage service.',
    'Do not hoard or mass-collect data.',
    'Follow the naming guidelines: never use "AniList" alone as the app name.',
    'Do not run a competing anime list/tracker service.',
  ],
};

export function mapAniListMedia(raw: unknown, fetchedAt: string): NormalizedMetadata {
  if (!isObject(raw)) throw new ProviderError('invalid_response', 'AniList returned an unexpected media shape.');
  const id = positiveInt(raw.id);
  if (id === null) throw new ProviderError('invalid_response', 'AniList media has no valid id.');
  const t = isObject(raw.title) ? raw.title : {};
  const english = asString(t.english);
  const romaji = asString(t.romaji);
  const native = asString(t.native);
  const cover = isObject(raw.coverImage) ? raw.coverImage : {};
  const start = isObject(raw.startDate) ? raw.startDate : {};
  const mal = positiveInt(raw.idMal);
  const ids: Record<string, string> = { anilist: String(id) };
  if (mal !== null) ids.mal = String(mal);
  return {
    provider: 'anilist',
    externalId: String(id),
    ids,
    url: httpsUrlOrNull(raw.siteUrl),
    title: english ?? romaji ?? native,
    titleEnglish: english,
    titleRomaji: romaji,
    titleNative: native,
    synonyms: uniqueStrings(Array.isArray(raw.synonyms) ? raw.synonyms : []),
    synopsis: plainText(raw.description),
    format: normalizeFormat(raw.format),
    status: normalizeStatus(raw.status),
    season: normalizeSeason(raw.season),
    year: yearOrNull(raw.seasonYear) ?? yearOrNull(start.year),
    episodeCount: positiveInt(raw.episodes),
    genres: uniqueStrings(Array.isArray(raw.genres) ? raw.genres : []),
    posterUrl: httpsUrlOrNull(cover.extraLarge) ?? httpsUrlOrNull(cover.large),
    bannerUrl: httpsUrlOrNull(raw.bannerImage),
    rating: ratingFrom100(raw.averageScore),
    fetchedAt,
  };
}

export function createAniListProvider(fetchImpl: FetchLike, now: () => string = () => new Date().toISOString()): MetadataProvider {
  async function query(q: string, variables: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    const res = await providerFetch(fetchImpl, ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ query: q, variables }),
      signal,
    }, 'graphql.anilist.co');
    const body = await readJson(res);
    const errors = isObject(body) && Array.isArray(body.errors) ? body.errors : [];
    const first = errors[0];
    if (res.status === 404 || (isObject(first) && first.status === 404)) throw new ProviderError('not_found', 'AniList has no matching title.');
    if (!res.ok || errors.length > 0) throw new ProviderError('unavailable', `AniList returned an error (${res.status}).`);
    if (!isObject(body) || !isObject(body.data)) throw new ProviderError('invalid_response', 'AniList returned no data object.');
    return body.data;
  }

  return {
    id: 'anilist',
    displayName: 'AniList',
    capabilities: { byId: true, search: true },
    attribution: ANILIST_ATTRIBUTION,
    termsVerified: true,
    async fetchById(externalId, signal) {
      const id = positiveInt(externalId);
      if (id === null) throw new ProviderError('not_found', 'Not a valid AniList id.');
      const data = await query(BY_ID, { id }, signal);
      if (!isObject(data) || data.Media === null || data.Media === undefined) throw new ProviderError('not_found', 'AniList has no matching title.');
      return mapAniListMedia(data.Media, now());
    },
    async search(title, signal, limit = 8) {
      const data = await query(SEARCH, { search: title.slice(0, 100), perPage: Math.min(Math.max(limit, 1), 10) }, signal);
      const page = isObject(data) && isObject(data.Page) ? data.Page : null;
      const media = page && Array.isArray(page.media) ? page.media : [];
      const fetchedAt = now();
      return media.flatMap((m) => { try { return [mapAniListMedia(m, fetchedAt)]; } catch { return []; } });
    },
  };
}
