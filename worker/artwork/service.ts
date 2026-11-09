import type { MetadataCache } from '../metadata/cache';
import type { LiveTitle } from '../live/types';
import type { EpisodeRecord } from '../metadata/types';
import type { ArtworkLookup, ArtworkProvider, TmdbArtwork } from './tmdb';

type CachedArtwork = { artwork: TmdbArtwork | null };
const inflight = new Map<string, Promise<TmdbArtwork | null>>();
const episodeInflight = new Map<string, Promise<Record<number, string>>>();

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function cacheKey(input: ArtworkLookup): string {
  const titleBits = [input.title, ...(input.alternateTitles ?? []).slice(0, 3)]
    .map((v) => v.normalize('NFKC').toLowerCase().trim()).join('|');
  return `artwork:tmdb:${hash(`${titleBits}|${input.year ?? ''}|${input.format ?? ''}`)}`;
}

async function lookupCached(
  input: ArtworkLookup,
  provider: ArtworkProvider,
  cache: MetadataCache,
): Promise<TmdbArtwork | null> {
  const key = cacheKey(input);
  const cached = await cache.get<CachedArtwork>(key);
  if (cached && Object.prototype.hasOwnProperty.call(cached, 'artwork')) return cached.artwork;

  const pending = inflight.get(key);
  if (pending) return pending;
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const artwork = await provider.lookup(input, controller.signal);
      await cache.put(key, { artwork } satisfies CachedArtwork, artwork ? 30 * 86_400 : 7 * 86_400);
      return artwork;
    } catch (error) {
      // Short negative cache dampens repeated 401/429/5xx bursts without hiding a later recovery.
      await cache.put(key, { artwork: null } satisfies CachedArtwork, 5 * 60);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

function mergeArtwork(title: LiveTitle, artwork: TmdbArtwork | null): LiveTitle {
  if (!artwork || (!artwork.posterUrl && !artwork.bannerUrl)) return title;
  return {
    ...title,
    card: {
      ...title.card,
      posterUrl: artwork.posterUrl ?? title.card.posterUrl,
      bannerUrl: artwork.bannerUrl ?? title.card.bannerUrl,
    },
  };
}

/** Enrich one page in a small bounded pool. TMDB failure never makes catalogue data unavailable. */
export async function enrichArtwork(
  titles: LiveTitle[],
  provider: ArtworkProvider | undefined,
  cache: MetadataCache,
): Promise<LiveTitle[]> {
  if (!provider || titles.length === 0) return titles;
  const result = [...titles];
  let cursor = 0;
  const worker = async () => {
    while (cursor < titles.length) {
      const index = cursor++;
      const item = titles[index]!;
      const input: ArtworkLookup = {
        title: item.card.title,
        alternateTitles: item.altTitles,
        year: item.card.releaseYear,
        format: item.card.format,
      };
      try {
        const artwork = await lookupCached(input, provider, cache);
        result[index] = mergeArtwork(item, artwork);
      } catch {
        // Artwork is optional. Keep catalogue artwork if TMDB is unavailable or the token is invalid.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, titles.length) }, () => worker()));
  return result;
}

export async function enrichArtworkOne(
  title: LiveTitle,
  provider: ArtworkProvider | undefined,
  cache: MetadataCache,
): Promise<LiveTitle> {
  return (await enrichArtwork([title], provider, cache))[0] ?? title;
}


/** Add TMDB season stills to episode rows. A series backdrop/poster is used when an individual still is absent. */
export async function enrichEpisodeArtwork(
  title: LiveTitle,
  episodes: EpisodeRecord[],
  provider: ArtworkProvider | undefined,
  cache: MetadataCache,
): Promise<EpisodeRecord[]> {
  if (!provider || !provider.episodeStills || episodes.length === 0) return episodes;
  const input: ArtworkLookup = {
    title: title.card.title,
    alternateTitles: title.altTitles,
    year: title.card.releaseYear,
    format: title.card.format,
  };
  let artwork: TmdbArtwork | null;
  try {
    artwork = await lookupCached(input, provider, cache);
  } catch {
    return episodes;
  }
  if (!artwork || artwork.mediaType !== 'tv') return episodes;
  const fallback = artwork.bannerUrl ?? artwork.posterUrl;
  const key = `artwork:tmdb:episode-stills:${hash(`${artwork.tmdbId}|${input.title}|${input.year ?? ''}`)}`;
  let stills = await cache.get<Record<number, string>>(key);
  if (!stills) {
    let pending = episodeInflight.get(key);
    if (!pending) {
      pending = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
          const found = await provider.episodeStills!(artwork!, input, controller.signal);
          await cache.put(key, found, Object.keys(found).length ? 30 * 86_400 : 6 * 3_600);
          return found;
        } catch {
          await cache.put(key, {}, 5 * 60);
          return {};
        } finally {
          clearTimeout(timer);
        }
      })().finally(() => episodeInflight.delete(key));
      episodeInflight.set(key, pending);
    }
    stills = await pending;
  }
  return episodes.map((episode) => ({
    ...episode,
    thumbnailUrl: stills?.[episode.episodeNumber] ?? episode.thumbnailUrl ?? fallback,
  }));
}
