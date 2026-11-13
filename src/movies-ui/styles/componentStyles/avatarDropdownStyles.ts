import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const avatarDropdownStyles = createStyles({
  // Trigger (avatar button in nav)
  trigger: (isFocused: boolean, isOpen: boolean) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer' as const,
    padding: 4,
    borderRadius: 4,
    outline: isFocused ? '2px solid #fff' : 'none',
    outlineOffset: 2,
    transition: 'background 150ms',
    backgroundColor: isOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
  }),

  triggerAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    overflow: 'hidden' as const,
    background: '#222',
    flexShrink: 0,
  },

  triggerAvatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block' as const,
  },

  triggerCaret: (isOpen: boolean) => ({
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    transition: 'transform 150ms',
    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
  }),

  // --- Desktop dropdown ---
  desktopMenu: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    minWidth: 220,
    background: 'rgba(0, 0, 0, 0.95)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4,
    padding: '8px 0',
    boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
    zIndex: 100,
    fontFamily: theme.typography.fontFamily,
  },

  // --- Mobile bottom sheet ---
  mobileBackdrop: (open: boolean) => ({
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    opacity: open ? 1 : 0,
    pointerEvents: open ? 'auto' as const : 'none' as const,
    transition: 'opacity 200ms ease-out',
    display: 'flex' as const,
    alignItems: 'flex-end' as const,
  }),

  mobileSheet: (open: boolean) => ({
    width: '100%',
    background: '#181818',
    borderRadius: '16px 16px 0 0',
    padding: '8px 0 32px',
    transform: open ? 'translateY(0)' : 'translateY(100%)',
    transition: 'transform 250ms ease-out',
    fontFamily: theme.typography.fontFamily,
  }),

  mobileGrip: {
    width: 36,
    height: 4,
    background: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    margin: '8px auto 16px',
  },

  // --- TV side panel ---
  tvBackdrop: (open: boolean) => ({
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    zIndex: 200,
    opacity: open ? 1 : 0,
    pointerEvents: open ? 'auto' as const : 'none' as const,
    transition: 'opacity 200ms ease-out',
    display: 'flex' as const,
    justifyContent: 'flex-end' as const,
  }),

  tvPanel: (open: boolean) => ({
    width: 380,
    height: '100%',
    background: '#0d0d0d',
    borderLeft: '1px solid rgba(255,255,255,0.1)',
    padding: '40px 24px',
    transform: open ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 250ms ease-out',
    fontFamily: theme.typography.fontFamily,
    overflowY: 'auto' as const,
  }),

  // Section headers
  sectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    padding: '8px 16px 4px',
  },

  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.1)',
    margin: '8px 0',
  },

  // Profile row in menu
  profileRow: (isCurrent: boolean, isFocused: boolean) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: '10px 16px',
    background: isCurrent ? 'rgba(255,255,255,0.08)' : isFocused ? 'rgba(255,255,255,0.12)' : 'transparent',
    border: 'none',
    width: '100%',
    cursor: 'pointer' as const,
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'left' as const,
    outline: isFocused ? '2px solid #e50914' : 'none',
    outlineOffset: -2,
    transition: 'background 150ms',
  }),

  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    overflow: 'hidden' as const,
    flexShrink: 0,
  },

  profileAvatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },

  profileNameInRow: {
    flex: 1,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },

  currentBadge: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    flexShrink: 0,
  },

  // Action button
  actionRow: (isFocused: boolean) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: '12px 16px',
    background: isFocused ? 'rgba(255,255,255,0.12)' : 'transparent',
    border: 'none',
    width: '100%',
    cursor: 'pointer' as const,
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'left' as const,
    outline: isFocused ? '2px solid #e50914' : 'none',
    outlineOffset: -2,
    transition: 'background 150ms',
  }),

  actionIcon: {
    width: 20,
    height: 20,
    color: 'rgba(255,255,255,0.7)',
    flexShrink: 0,
  },
});
