// anime-offline-database (manami-project). A DATASET, not a live API: used to build the catalogue index and the cross-provider
// ID map. Recent releases are ODbL-1.0 (attribution + share-alike); older releases were AGPL-3.0, so every file's own `license`
// field is checked and unexpected licences are refused rather than assumed. Only pure mapping lives here; downloading and loading
// into D1 is a separate, manually triggered job.
import { httpsUrlOrNull, normalizeFormat, normalizeSeason, normalizeStatus, positiveInt, uniqueStrings, yearOrNull } from '../normalize';
import type { Attribution, ExternalIds, NormalizedMetadata } from '../types';
import { asString, isObject } from './http';

export const MANAMI_ATTRIBUTION: Attribution = {
  providerId: 'manami',
  displayName: 'anime-offline-database',
  text: 'Catalogue index from the anime-offline-database by the manami project, used under the Open Database License (ODbL 1.0).',
  url: 'https://github.com/manami-project/anime-offline-database',
  termsUrl: 'https://github.com/manami-project/anime-offline-database/blob/master/LICENSE',
  license: 'ODbL-1.0',
  requirements: [
    'Attribute the source (shown in the site footer).',
    'Share-alike: a publicly shared derived database must stay under ODbL. KAIRO is a private personal site that does not distribute the database.',
    'Re-check the licence field of each release before importing.',
  ],
};

export class UnacceptableLicenseError extends Error {}

/** Accepts only ODbL 1.0. Anything else (including the older AGPL-3.0 releases) must be reviewed by the owner first. */
export function assertAcceptableLicense(license: unknown): string {
  const name = isObject(license) ? asString(license.name) : null;
  if (name && /(^|\b)(odbl|open database license)/i.test(name) && /1\.0/.test(name)) return 'ODbL-1.0';
  throw new UnacceptableLicenseError(`Dataset licence "${name ?? 'missing'}" is not the reviewed ODbL-1.0. Review the licence before importing.`);
}

const HOSTS: { host: RegExp; key: string; id: RegExp }[] = [
  { host: /(^|\.)myanimelist\.net$/, key: 'mal', id: /^\/anime\/(\d+)/ },
  { host: /(^|\.)anilist\.co$/, key: 'anilist', id: /^\/anime\/(\d+)/ },
  { host: /(^|\.)kitsu\.(io|app)$/, key: 'kitsu', id: /^\/anime\/(\d+)/ },
  { host: /(^|\.)anidb\.net$/, key: 'anidb', id: /^\/anime\/(\d+)/ },
  { host: /(^|\.)anisearch\.com$/, key: 'anisearch', id: /^\/anime\/(\d+)/ },
  { host: /(^|\.)livechart\.me$/, key: 'livechart', id: /^\/anime\/(\d+)/ },
  { host: /(^|\.)notify\.moe$/, key: 'notify', id: /^\/anime\/([A-Za-z0-9_-]+)/ },
  { host: /(^|\.)anime-planet\.com$/, key: 'animeplanet', id: /^\/anime\/([A-Za-z0-9-]+)/ },
];

/** "https://anilist.co/anime/1535" -> { provider: 'anilist', id: '1535' }. Unknown hosts return null. */
export function parseSourceUrl(raw: unknown): { provider: string; id: string } | null {
  if (typeof raw !== 'string') return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  for (const h of HOSTS) {
    if (!h.host.test(u.hostname)) continue;
    const m = h.id.exec(u.pathname);
    return m ? { provider: h.key, id: m[1] } : null;
  }
  return null;
}

export function idsFromUrls(urls: unknown): ExternalIds {
  const ids: ExternalIds = {};
  if (!Array.isArray(urls)) return ids;
  for (const url of urls) {
    const parsed = parseSourceUrl(url);
    if (parsed && !(parsed.provider in ids)) ids[parsed.provider] = parsed.id;
  }
  return ids;
}

export type ManamiMapped = { metadata: NormalizedMetadata; relatedIds: { provider: string; id: string }[] };

/** Returns null for entries that cannot be used (no title, or no recognisable source ID). */
export function mapManamiEntry(raw: unknown, fetchedAt: string): ManamiMapped | null {
  if (!isObject(raw)) return null;
  const title = asString(raw.title);
  const ids = idsFromUrls(raw.sources);
  if (!title || Object.keys(ids).length === 0) return null;
  const season = isObject(raw.animeSeason) ? raw.animeSeason : {};
  const primary = Object.keys(ids)[0];
  const relatedIds = (Array.isArray(raw.relations) ? raw.relations : []).flatMap((u) => { const p = parseSourceUrl(u); return p ? [p] : []; });
  return {
    metadata: {
      provider: 'manami',
      externalId: `${primary}:${ids[primary]}`,
      ids,
      url: null,
      title, titleEnglish: null, titleRomaji: null, titleNative: null,
      synonyms: uniqueStrings(Array.isArray(raw.synonyms) ? raw.synonyms : []),
      synopsis: null, // the dataset has no synopsis; it is never invented
      format: normalizeFormat(raw.type),
      status: normalizeStatus(raw.status),
      season: normalizeSeason(season.season),
      year: yearOrNull(season.year),
      episodeCount: positiveInt(raw.episodes),
      genres: [], // dataset "tags" are not genres and are not mixed into them
      posterUrl: httpsUrlOrNull(raw.picture),
      bannerUrl: null,
      rating: null, // the dataset carries no score
      fetchedAt,
    },
    relatedIds,
  };
}
