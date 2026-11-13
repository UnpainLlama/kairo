import { createStyles } from '../styleEngine';
import { theme } from '../theme';
import type { InteractionMode } from '../../state/slices/uiSlice';

export const navStyles = createStyles({
  container: (navFocused: boolean) => ({
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    height: theme.spacing.headerHeight,
    display: 'flex' as const,
    alignItems: 'center' as const,
    paddingLeft: theme.spacing.edgePadding,
    paddingRight: theme.spacing.edgePadding,
    background: navFocused
      ? 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 80%, transparent 100%)'
      : 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
    transition: 'background 300ms ease-out',
    fontFamily: theme.typography.fontFamily,
  }),

  logo: {
    color: '#e50914',
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: -1,
    marginRight: 40,
    flexShrink: 0,
  },

  navList: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    listStyle: 'none',
    margin: 0,
    padding: 0,
    flex: 1,
  },

  searchIcon: {
    width: 18,
    height: 18,
    display: 'inline-block',
    verticalAlign: 'middle',
  },

  navItem: (isActive: boolean, isFocused: boolean, _isWeb: boolean) => ({
    padding: '6px 14px',
    fontSize: 14,
    fontWeight: isActive ? 700 : 400,
    color: (isFocused || isActive) ? '#ffffff' : 'rgba(255,255,255,0.7)',
    cursor: 'pointer' as const,
    borderRadius: 4,
    background: isFocused ? 'rgba(255,255,255,0.15)' : 'transparent',
    transition: 'all 150ms ease-out',
    transform: isFocused ? 'scale(1.05)' : 'scale(1)',
    whiteSpace: 'nowrap' as const,
    position: 'relative' as const,
  }),

  underline: (isActive: boolean) => ({
    position: 'absolute' as const,
    bottom: 2,
    left: '50%',
    transform: 'translateX(-50%)',
    width: isActive ? '60%' : '0%',
    height: 2,
    background: '#e50914',
    borderRadius: 1,
    transition: 'width 200ms ease-out',
  }),

  searchLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },

  // Web/TV toggle
  toggleContainer: {
    marginLeft: 'auto',
    flexShrink: 0,
  },

  toggleButton: (_mode: InteractionMode) => ({
    position: 'relative' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    width: 80,
    height: 32,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    cursor: 'pointer' as const,
    padding: 0,
    overflow: 'hidden' as const,
    fontFamily: theme.typography.fontFamily,
  }),

  toggleLabel: (isActive: boolean) => ({
    flex: 1,
    textAlign: 'center' as const,
    fontSize: 12,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
    zIndex: 1,
    position: 'relative' as const,
    transition: 'color 200ms ease-out',
    pointerEvents: 'none' as const,
  }),

  toggleSlider: (isTv: boolean) => ({
    position: 'absolute' as const,
    top: 2,
    left: isTv ? 40 : 2,
    width: 38,
    height: 28,
    borderRadius: 14,
    background: isTv ? '#e50914' : 'rgba(255,255,255,0.2)',
    transition: 'left 200ms ease-out, background 200ms ease-out',
  }),
});
