/**
 * Official CineSrc movie embed URL builder.
 *
 * CineSrc identifies movies by their numeric TMDB ID. Playback position and player controls
 * are restored through CineSrc's documented embed parameters and postMessage methods.
 */
export const CINESRC_ORIGIN = 'https://cinesrc.st';

export type CineSrcEmbedOptions = {
  startSeconds?: number;
  sourceId?: string;
};

/**
 * Build the documented movie URL. The iframe player posts lifecycle/progress events to Kairo.
 */
export function cinesrcMovieEmbedUrl(tmdbId: string | number, options: CineSrcEmbedOptions = {}): string {
  const id = String(tmdbId).trim();
  if (!/^[1-9]\d{0,11}$/.test(id)) {
    throw new Error('CineSrc movie embeds require a positive numeric TMDB id.');
  }
  const params = new URLSearchParams({ autoplay: 'true', back: 'close', color: '#e5e5e5' });
  const startSeconds = Number(options.startSeconds ?? 0);
  if (Number.isFinite(startSeconds) && startSeconds > 15) {
    params.set('t', String(Math.floor(startSeconds)));
    params.set('continueprompt', 'false');
  }
  if (typeof options.sourceId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(options.sourceId)) {
    params.set('lastserver', options.sourceId);
  }
  return `${CINESRC_ORIGIN}/embed/movie/${id}?${params.toString()}`;
}
