import { uniqueStrings } from '../metadata/normalize';
import type { NormalizedMetadata } from '../metadata/types';
import { makeId, makeSlug } from './ids';
import type { LiveTitle, SourceId } from './types';

const num = (v: string | undefined): number | null => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Normalised provider metadata -> the card and record KAIRO serves. */
export function toLiveTitle(meta: NormalizedMetadata, provider: SourceId): LiveTitle {
  const own = Number(meta.externalId);
  const title = meta.title ?? meta.titleRomaji ?? meta.titleNative ?? 'Untitled';
  const altTitles = uniqueStrings([meta.titleEnglish, meta.titleRomaji, meta.titleNative, ...meta.synonyms])
    .filter((t) => t.toLowerCase() !== title.toLowerCase())
    .slice(0, 12);
  return {
    card: {
      id: makeId('a', own),
      slug: makeSlug(title, 'a', own),
      title,
      synopsis: meta.synopsis ?? '',
      posterUrl: meta.posterUrl,
      bannerUrl: meta.bannerUrl,
      format: meta.format,
      releaseYear: meta.year,
      season: meta.season,
      status: meta.status,
      rating: meta.rating,
      episodeCount: meta.episodeCount,
      genres: meta.genres,
    },
    altTitles,
    // AniList's idMal is retained only as an identifier bridge for Jikan episode discovery.
    malId: num(meta.ids.mal),
    anilistId: own,
    url: meta.url,
    provider,
  };
}
