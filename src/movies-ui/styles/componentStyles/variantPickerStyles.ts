import { createStyles } from '../styleEngine';
import { theme } from '../theme';

const CARD_WIDTH = 280;
const CARD_HEIGHT = 360;
const PREVIEW_HEIGHT = 220;

export const variantPickerStyles = createStyles({
  fullscreen: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 250,
    background: theme.colors.background,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflowY: 'auto' as const,
    fontFamily: theme.typography.fontFamily,
    padding: '40px 20px',
  },

  container: {
    width: '100%',
    maxWidth: 1100,
    textAlign: 'center' as const,
  },

  heading: {
    color: theme.colors.text,
    fontSize: 48,
    fontWeight: 400,
    marginBottom: 12,
    fontFamily: theme.typography.fontFamily,
  },

  subheading: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 16,
    fontWeight: 400,
    marginBottom: 48,
    fontFamily: theme.typography.fontFamily,
  },

  cardGrid: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 28,
    marginBottom: 32,
  },

  card: (isFocused: boolean, accent: string, isShaking: boolean) => ({
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden' as const,
    background: '#181818',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer' as const,
    padding: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    transition: `transform ${theme.animation.focusDuration}ms ease-out, box-shadow ${theme.animation.focusDuration}ms ease-out`,
    transform: isFocused ? 'scale(1.06)' : 'scale(1)',
    transformOrigin: 'center center',
    boxShadow: isFocused
      ? `0 12px 36px rgba(0,0,0,0.55), 0 0 0 2px ${accent}, 0 0 32px ${accent}55`
      : '0 4px 16px rgba(0,0,0,0.4)',
    fontFamily: theme.typography.fontFamily,
    position: 'relative' as const,
    animation: isShaking ? 'vp-card-shake 350ms ease-in-out' : undefined,
  }),

  previewWrap: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    background: '#0a0a0a',
    overflow: 'hidden' as const,
    flexShrink: 0,
  },

  cardBody: {
    padding: '20px 22px 22px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    gap: 6,
    textAlign: 'left' as const,
    flex: 1,
  },

  cardName: (accent: string, isFocused: boolean) => ({
    color: isFocused ? accent : theme.colors.text,
    fontSize: 22,
    fontWeight: 700,
    transition: `color ${theme.animation.focusDuration}ms ease-out`,
    fontFamily: theme.typography.fontFamily,
  }),

  cardTagline: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.4,
    fontFamily: theme.typography.fontFamily,
  },

  comingSoonBadge: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(6px)' as const,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    border: '1px solid rgba(255,255,255,0.15)',
    fontFamily: theme.typography.fontFamily,
  },

  // Cancel/back button (shown only when re-entering from Settings)
  cancelButton: (isFocused: boolean) => ({
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: 500,
    border: '1px solid rgba(255,255,255,0.3)',
    padding: '10px 24px',
    borderRadius: 4,
    cursor: 'pointer' as const,
    fontFamily: theme.typography.fontFamily,
    outline: isFocused ? '2px solid #fff' : 'none',
    outlineOffset: 2,
    marginTop: 16,
    transition: 'background 150ms, color 150ms',
  }),
});
