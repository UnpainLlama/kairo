/**
 * CineSrc iframe URL builders.
 *
 * The Movies catalogue supplies numeric TMDB IDs. CineSrc resolves playback
 * directly from those IDs; KAIRO does not use an intermediate provider router.
 */
export const CINESRC_ORIGIN = 'https://cinesrc.st';

function positiveId(value: string | number, label: string, maxDigits = 12): string {
  const id = String(value).trim();
  if (!new RegExp(`^[1-9]\\d{0,${maxDigits - 1}}$`).test(id)) {
    throw new Error(`${label} must be a positive numeric ID.`);
  }
  return id;
}

/** Direct movie embed, addressed by TMDB movie ID. */
export function cinesrcMovieEmbedUrl(tmdbId: string | number): string {
  const id = positiveId(tmdbId, 'TMDB movie ID');
  return `${CINESRC_ORIGIN}/embed/movie/${id}`;
}

/** Direct TV episode embed; season and episode numbers are 1-indexed. */
export function cinesrcTvEmbedUrl(
  tmdbId: string | number,
  season: string | number,
  episode: string | number,
): string {
  const id = positiveId(tmdbId, 'TMDB TV ID');
  const seasonNumber = positiveId(season, 'Season number', 3);
  const episodeNumber = positiveId(episode, 'Episode number', 4);
  return `${CINESRC_ORIGIN}/embed/tv/${id}?s=${seasonNumber}&e=${episodeNumber}`;
}
