/**
 * Official CineSrc movie embed URL builder.
 *
 * CineSrc identifies movies by their numeric TMDB ID. The documented iframe embed needs no
 * API key or proxy: https://cinesrc.st/docs
 */
export const CINESRC_ORIGIN = 'https://cinesrc.st';

/**
 * Build the documented movie URL.
 * - back=close makes the player's own back button post `cinesrc:close` to this page.
 * - color sets the player accent (grayscale to match the Movies section).
 */
export function cinesrcMovieEmbedUrl(tmdbId: string | number): string {
  const id = String(tmdbId).trim();
  if (!/^[1-9]\d{0,11}$/.test(id)) {
    throw new Error('CineSrc movie embeds require a positive numeric TMDB id.');
  }
  const params = new URLSearchParams({ autoplay: 'true', back: 'close', color: '#e5e5e5' });
  return `${CINESRC_ORIGIN}/embed/movie/${id}?${params.toString()}`;
}
