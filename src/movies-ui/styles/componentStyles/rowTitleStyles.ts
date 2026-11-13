import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const rowTitleStyles = createStyles({
  title: (isRowFocused: boolean, paddingLeft: number = theme.spacing.edgePadding) => ({
    color: theme.colors.text,
    fontSize: theme.typography.rowTitle.fontSize,
    fontWeight: theme.typography.rowTitle.fontWeight,
    letterSpacing: theme.typography.rowTitle.letterSpacing,
    marginBottom: 12,
    paddingLeft,
    opacity: isRowFocused ? 1 : 0.6,
    transition: 'opacity 200ms ease-out',
  }),
});
