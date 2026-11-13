import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const rowStyles = createStyles({
  container: {},

  // TV mode
  overflowWrapper: {
    overflow: 'hidden',
    paddingTop: 40,
    paddingBottom: 40,
    marginTop: -40,
    marginBottom: -40,
  },

  tilesWrapper: (scrollOffset: number) => ({
    display: 'flex' as const,
    gap: theme.spacing.tileGap,
    paddingLeft: theme.spacing.edgePadding,
    paddingRight: theme.spacing.edgePadding,
    transform: `translateX(-${scrollOffset}px)`,
  }),

  leftSpacer: (width: number) => ({
    width,
    flexShrink: 0,
  }),

  // Web mode
  webRowContainer: {
    position: 'relative' as const,
  },

  webTilesWrapper: {
    display: 'flex' as const,
    gap: theme.spacing.tileGap,
    paddingLeft: theme.spacing.edgePadding,
    paddingRight: theme.spacing.edgePadding,
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    scrollSnapType: 'x mandatory' as const,
    // Inset the snap-start so the first tile aligns with the row title's
    // left edge instead of being snapped flush against the viewport edge.
    scrollPaddingLeft: theme.spacing.edgePadding,
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
    paddingTop: 16,
    paddingBottom: 16,
  },

  chevron: (side: 'left' | 'right') => ({
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    [side]: 0,
    width: 48,
    zIndex: 5,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: side === 'left'
      ? 'linear-gradient(90deg, rgba(20,20,20,0.9) 0%, transparent 100%)'
      : 'linear-gradient(270deg, rgba(20,20,20,0.9) 0%, transparent 100%)',
    border: 'none',
    color: '#fff',
    fontSize: 36,
    cursor: 'pointer' as const,
    opacity: 0.7,
    transition: 'opacity 150ms',
  }),
});
