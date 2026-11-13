import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const overlayStyles = createStyles({
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: theme.colors.overlayBg,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  panel: {
    // Width matches the real Netflix web detail modal — generous on desktop,
    // 90% on smaller screens, capped so it doesn't sprawl on ultrawide.
    width: '90%',
    maxWidth: 1200,
    maxHeight: '90vh',
    background: theme.colors.surface,
    borderRadius: 8,
    overflowX: 'hidden',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },

  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(20,20,20,0.7)',
    color: '#fff',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 150ms',
  },

  heroSection: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    flexShrink: 0,
  },

  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },

  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    background: `linear-gradient(180deg, transparent 0%, ${theme.colors.surface} 100%)`,
    pointerEvents: 'none',
  },

  heroOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
    zIndex: 2,
  },

  heroLogo: {
    maxWidth: '45%',
    maxHeight: 100,
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))',
  },

  heroTitle: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: theme.typography.fontWeightBold,
    fontFamily: theme.typography.fontFamily,
    textShadow: '0 2px 8px rgba(0,0,0,0.7)',
  },

  infoSection: {
    display: 'flex',
    gap: 24,
    padding: '16px 32px 8px',
  },

  infoLeft: {
    flex: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },

  infoRight: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },

  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily,
  },

  matchBadge: {
    color: '#46d369',
    fontWeight: theme.typography.fontWeightSemibold,
  },

  yearText: {
    color: theme.colors.textSecondary,
  },

  ratingBadge: {
    border: '1px solid rgba(255,255,255,0.4)',
    padding: '1px 6px',
    fontSize: 12,
    color: theme.colors.textSecondary,
    borderRadius: 3,
  },

  synopsis: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 1.5,
    opacity: 0.9,
    fontFamily: theme.typography.fontFamily,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },

  genreLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily,
  },

  genreList: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: theme.typography.fontFamily,
  },

  genreDot: {
    color: theme.colors.textMuted,
    margin: '0 2px',
  },

  buttonsRow: {
    display: 'flex',
    gap: 12,
    padding: '8px 32px 20px',
  },

  button: (isFocused: boolean, isWeb = false) => ({
    padding: '10px 24px',
    borderRadius: 4,
    border: 'none',
    fontSize: 15,
    fontWeight: theme.typography.fontWeightSemibold,
    fontFamily: theme.typography.fontFamily,
    cursor: isWeb ? 'pointer' : 'default' as const,
    color: isFocused ? '#000' : theme.colors.text,
    background: isFocused ? '#fff' : 'rgba(255,255,255,0.15)',
    transform: isFocused ? 'scale(1.05)' : 'scale(1)',
    transition: 'all 150ms ease-out',
  }),

  // White rectangular Play button (Netflix style)
  playButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 22px',
    borderRadius: 4,
    border: 'none',
    background: '#fff',
    color: '#000',
    fontSize: 16,
    fontWeight: theme.typography.fontWeightBold,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
    transition: 'background 150ms ease-out',
  },

  // (Circular My List / Like icon buttons live in GlobalStyles.tsx as the
  // .detail-icon-btn class — using CSS :hover keeps the hover state from
  // getting stuck when the inner icon swaps on click.)

  // Trailer controls overlay (bottom-right of the hero in web mode)
  trailerControls: {
    position: 'absolute' as const,
    right: 16,
    bottom: 16,
    display: 'flex' as const,
    gap: 8,
    zIndex: 3,
  },
});
