import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const tileStyles = createStyles({
  container: {
    width: theme.tile.width,
    height: theme.tile.height,
    flexShrink: 0,
    cursor: 'default',
    userSelect: 'none',
    overflow: 'visible',
  },

  image: (brightness: number, opacity: number) => ({
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    borderRadius: theme.tile.borderRadius,
    display: 'block' as const,
    filter: `brightness(${brightness})`,
    transition: `filter ${theme.animation.focusDuration}ms ease-out, opacity ${theme.animation.trailerFadeMs}ms ease-out`,
    opacity,
  }),

  innerContainer: (width: number, height: number) => ({
    position: 'relative' as const,
    width,
    height,
    borderRadius: theme.tile.borderRadius,
    overflow: 'hidden' as const,
    transition: `width ${theme.animation.trailerFadeMs}ms ease-out, height ${theme.animation.trailerFadeMs}ms ease-out`,
  }),

  videoOverlay: {
    borderRadius: theme.tile.borderRadius,
  },

  logo: (logoOnRight: boolean, opacity: number, fadeOut: boolean, cached: boolean) => ({
    position: 'absolute' as const,
    bottom: 8,
    ...(logoOnRight ? { right: 8 } : { left: 8 }),
    maxWidth: '55%',
    maxHeight: '40%',
    objectFit: 'contain' as const,
    filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))',
    opacity: fadeOut ? 0 : opacity,
    transform: opacity > 0 ? 'scale(1)' : 'scale(0.92)',
    transition: cached
      ? 'opacity 200ms ease-out'
      : `opacity ${theme.animation.trailerFadeMs}ms ease-out, transform 350ms ease-out`,
  }),

});
