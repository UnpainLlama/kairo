import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const focusRingStyles = createStyles({
  ring: (isFocused: boolean, scale: number, transformOrigin: string) => ({
    transition: `transform ${theme.animation.focusDuration}ms ease-out, box-shadow ${theme.animation.focusDuration}ms ease-out`,
    transform: isFocused ? `scale(${scale})` : 'scale(1)',
    transformOrigin,
    zIndex: isFocused ? 10 : 1,
    position: 'relative' as const,
    boxShadow: isFocused ? '0 4px 16px rgba(0,0,0,0.5)' : 'none',
    borderRadius: theme.tile.borderRadius,
  }),
});
