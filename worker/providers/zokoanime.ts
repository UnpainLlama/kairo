export type ZokoAnimeTrack = 'sub' | 'hsub' | 'dub';

export type ZokoAnimeEmbedInput = {
  malId?: string | number | null;
  anilistId?: string | number | null;
  episodeNumber: number;
  track: ZokoAnimeTrack;
  color?: string;
};

function positiveId(value: string | number | null | undefined): string | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return /^\d{1,12}$/.test(raw) && Number(raw) > 0 ? raw : null;
}

/**
 * Builds the public ZokoAnime iframe URL documented on zokoanime.video.
 * This returns an iframe destination only; it does not fetch, proxy, extract,
 * or interpret the provider's media or postMessage traffic.
 */
export function buildZokoAnimeEmbedUrl(input: ZokoAnimeEmbedInput): string | null {
  if (!Number.isInteger(input.episodeNumber) || input.episodeNumber < 1 || input.episodeNumber > 100_000) return null;
  if (!['sub', 'hsub', 'dub'].includes(input.track)) return null;
  const malId = positiveId(input.malId);
  const anilistId = positiveId(input.anilistId);
  const source = malId ? 'mal' : anilistId ? 'anilist' : null;
  const id = malId ?? anilistId;
  if (!source || !id) return null;
  const color = (input.color ?? 'a78bfa').replace(/^#/, '');
  if (!/^[a-f0-9]{6}$/i.test(color)) return null;
  const url = new URL(`/stream/${source}/${id}/${input.episodeNumber}/${input.track}`, 'https://zokoanime.video');
  url.searchParams.set('color', color.toLowerCase());
  return url.href;
}
