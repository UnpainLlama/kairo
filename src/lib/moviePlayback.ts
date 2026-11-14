/**
 * Movie playback helpers (client-side embed URLs only).
 * Catalogue metadata stays in movies.ts; stream URLs are never stored in D1.
 */

export type MoviePlaybackServerId = 'vidlink';

export type MoviePlaybackServer = {
  id: MoviePlaybackServerId;
  label: string;
  kind: 'iframe';
};

/** Ordered server list shown on the detail player. Extend when Goojara / VidSrc land. */
export const MOVIE_PLAYBACK_SERVERS: MoviePlaybackServer[] = [
  { id: 'vidlink', label: 'VidLink', kind: 'iframe' },
];

export type VidLinkEmbedOptions = {
  /** When false, the player waits for user play. Default false. */
  autoplay?: boolean;
  /** Show title overlay. Default false. */
  title?: boolean;
  /** Show poster before play. Default true. */
  poster?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  icons?: 'default' | 'vid';
};

/**
 * Build a VidLink movie embed URL from a TMDB id.
 * Official params only control chrome; they do not disable third-party ads.
 */
export function vidlinkMovieEmbedUrl(
  tmdbId: string | number,
  options: VidLinkEmbedOptions = {},
): string {
  const id = String(tmdbId).trim();
  if (!/^\d+$/.test(id)) {
    throw new Error('VidLink movie embeds require a numeric TMDB id.');
  }

  const params = new URLSearchParams();
  params.set('autoplay', options.autoplay === true ? 'true' : 'false');
  params.set('title', options.title === true ? 'true' : 'false');
  params.set('poster', options.poster === false ? 'false' : 'true');
  params.set('primaryColor', (options.primaryColor ?? '000000').replace(/^#/, ''));
  params.set('secondaryColor', (options.secondaryColor ?? '111111').replace(/^#/, ''));
  params.set('icons', options.icons ?? 'default');

  return `https://vidlink.pro/movie/${id}?${params.toString()}`;
}

export function moviePlaybackEmbedUrl(
  serverId: MoviePlaybackServerId,
  tmdbId: string | number,
): string {
  switch (serverId) {
    case 'vidlink':
      return vidlinkMovieEmbedUrl(tmdbId);
    default: {
      const _exhaustive: never = serverId;
      return _exhaustive;
    }
  }
}
