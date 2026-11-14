/**
 * EmbedWave iframe URL builders.
 *
 * The Movies catalogue supplies numeric TMDB IDs. URLs are built locally;
 * no EmbedWave API key or server-side proxy is required for iframe embeds.
 */
export const EMBEDWAVE_ORIGIN = 'https://embedwave.cc';

export type EmbedWaveServerId = 'nxsha' | 'cinesrc' | 'videasy';

export const EMBEDWAVE_SERVERS: ReadonlyArray<{
  id: EmbedWaveServerId;
  label: string;
}> = [
  { id: 'nxsha', label: 'Multi HD' },
  { id: 'cinesrc', label: 'Cinesrc' },
  { id: 'videasy', label: '4K' },
];

function positiveId(value: string | number, label: string, maxDigits = 12): string {
  const id = String(value).trim();
  if (!new RegExp(`^[1-9]\\d{0,${maxDigits - 1}}$`).test(id)) {
    throw new Error(`${label} must be a positive numeric ID.`);
  }
  return id;
}

function withServer(url: URL, server?: EmbedWaveServerId): string {
  if (server !== undefined && !EMBEDWAVE_SERVERS.some((entry) => entry.id === server)) {
    throw new Error('Unsupported EmbedWave server.');
  }
  if (server) url.searchParams.set('server', server);
  return url.toString();
}

/** Movie embed, addressed by TMDB movie ID. */
export function embedWaveMovieEmbedUrl(
  tmdbId: string | number,
  server?: EmbedWaveServerId,
): string {
  const id = positiveId(tmdbId, 'TMDB movie ID');
  return withServer(new URL(`/embed/movie/${id}`, EMBEDWAVE_ORIGIN), server);
}

/** TV episode embed, with 1-indexed season and episode numbers. */
export function embedWaveTvEmbedUrl(
  tmdbId: string | number,
  season: string | number,
  episode: string | number,
  server?: EmbedWaveServerId,
): string {
  const id = positiveId(tmdbId, 'TMDB TV ID');
  const seasonNumber = positiveId(season, 'Season number', 3);
  const episodeNumber = positiveId(episode, 'Episode number', 4);
  return withServer(
    new URL(`/embed/tv/${id}/${seasonNumber}/${episodeNumber}`, EMBEDWAVE_ORIGIN),
    server,
  );
}
