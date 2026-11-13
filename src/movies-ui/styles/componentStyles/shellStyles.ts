import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const shellStyles = createStyles({
  // TV mode shell
  shell: {
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
    background: theme.colors.background,
    fontFamily: theme.typography.fontFamily,
    position: 'relative',
  },

  // Web mode shell — native scroll
  webShell: {
    width: '100%',
    minHeight: '100vh',
    background: theme.colors.background,
    fontFamily: theme.typography.fontFamily,
    position: 'relative',
  },

  // Web mode rows — normal flow
  webRowsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.rowGap,
    paddingBottom: 80,
  },

  // Mobile variant with tighter spacing
  mobileRowsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    paddingBottom: 80,
  },

  // TV mode scroll
  scrollContainer: (offset: number) => ({
    transform: `translateY(-${offset}px)`,
  }),

  rowsContainer: (totalHeight: number) => ({
    position: 'relative' as const,
    height: totalHeight,
    paddingTop: 20,
  }),

  rowWrapper: (top: number) => ({
    position: 'absolute' as const,
    top,
    left: 0,
    right: 0,
  }),
});
