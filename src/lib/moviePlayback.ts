/**
 * Official VidLink movie embed URL builder.
 *
 * VidLink identifies movie playback by the numeric TMDB movie ID. No API key
 * or proxy endpoint is required for the documented iframe integration.
 */
export const VIDLINK_ORIGIN = 'https://vidlink.pro';

export type VidLinkPlayerType = 'default' | 'jw';

/**
 * Build the documented movie URL. The default player uses the bare endpoint;
 * the optional JW player is selected with VidLink's documented ?player=jw flag.
 */
export function vidlinkMovieEmbedUrl(
  tmdbId: string | number,
  player: VidLinkPlayerType = 'default',
): string {
  const id = String(tmdbId).trim();
  if (!/^[1-9]\\d{0,11}$/.test(id)) {
    throw new Error('VidLink movie embeds require a positive numeric TMDB id.');
  }
  if (player !== 'default' && player !== 'jw') {
    throw new Error('Unsupported VidLink player type.');
  }

  return player === 'jw'
    ? `${VIDLINK_ORIGIN}/movie/${id}?player=jw`
    : `${VIDLINK_ORIGIN}/movie/${id}`;
}
