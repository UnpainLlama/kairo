import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const profileStyles = createStyles({
  fullscreen: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 200,
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

  heading: (size: 'large' | 'medium') => ({
    color: theme.colors.text,
    fontSize: size === 'large' ? 48 : 28,
    fontWeight: 400,
    marginBottom: 40,
    fontFamily: theme.typography.fontFamily,
  }),

  // Profile grid
  profileGrid: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 24,
    marginBottom: 32,
  },

  profileTile: (isFocused: boolean, isHovered: boolean) => ({
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: 12,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer' as const,
    padding: 8,
    borderRadius: 8,
    outline: isFocused ? '2px solid #fff' : 'none',
    outlineOffset: 4,
    transition: 'transform 200ms ease-out',
    transform: isFocused || isHovered ? 'scale(1.05)' : 'scale(1)',
    fontFamily: theme.typography.fontFamily,
  }),

  avatarCircle: (size: number, highlight: boolean) => ({
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden' as const,
    background: '#222',
    border: highlight ? '3px solid #fff' : '3px solid transparent',
    transition: 'border-color 200ms ease-out',
    flexShrink: 0,
    boxShadow: highlight ? '0 4px 16px rgba(229,9,20,0.4)' : '0 2px 8px rgba(0,0,0,0.4)',
  }),

  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block' as const,
  },

  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 32,
    background: 'linear-gradient(135deg, #444, #222)',
  },

  profileName: (highlight: boolean) => ({
    color: highlight ? theme.colors.text : 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: highlight ? 600 : 400,
    transition: 'color 200ms ease-out',
    fontFamily: theme.typography.fontFamily,
    maxWidth: 140,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  }),

  // Add profile tile
  addTile: (isFocused: boolean, isHovered: boolean) => ({
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: 12,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer' as const,
    padding: 8,
    borderRadius: 8,
    outline: isFocused ? '2px solid #fff' : 'none',
    outlineOffset: 4,
    transition: 'transform 200ms ease-out',
    transform: isFocused || isHovered ? 'scale(1.05)' : 'scale(1)',
    fontFamily: theme.typography.fontFamily,
  }),

  addCircle: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 60,
    fontWeight: 200,
    background: 'rgba(255,255,255,0.06)',
    border: '2px dashed rgba(255,255,255,0.3)',
  },

  // Manage button
  manageButton: (isFocused: boolean) => ({
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
    transition: 'background 150ms, color 150ms',
  }),

  // Edit indicator on profile tile (when manage mode active)
  editBadge: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    color: '#fff',
    fontSize: 24,
    borderRadius: '50%',
    pointerEvents: 'none' as const,
  },

  // Create / edit form
  formContainer: {
    background: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    padding: '32px 40px',
    maxWidth: 720,
    width: '100%',
    margin: '0 auto',
    textAlign: 'left' as const,
  },

  formHeader: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 24,
    fontFamily: theme.typography.fontFamily,
  },

  formSubheader: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 12,
    marginTop: 20,
    fontFamily: theme.typography.fontFamily,
  },

  // Avatar picker grid
  pickerGrid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
    gap: 12,
    maxHeight: 320,
    overflowY: 'auto' as const,
    padding: 4,
    scrollbarWidth: 'thin' as const,
  },

  pickerTile: (isSelected: boolean, isFocused: boolean) => ({
    width: 72,
    height: 72,
    borderRadius: '50%',
    overflow: 'hidden' as const,
    border: isSelected ? '3px solid #e50914' : '3px solid transparent',
    outline: isFocused ? '2px solid #fff' : 'none',
    outlineOffset: 2,
    cursor: 'pointer' as const,
    background: '#222',
    padding: 0,
    transition: 'border-color 150ms, transform 150ms',
    transform: isFocused || isSelected ? 'scale(1.08)' : 'scale(1)',
  }),

  pickerImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block' as const,
  },

  // Form buttons
  formButtonRow: {
    display: 'flex' as const,
    gap: 12,
    marginTop: 28,
    flexWrap: 'wrap' as const,
  },

  formButton: (variant: 'primary' | 'secondary' | 'danger', isFocused: boolean, disabled: boolean) => {
    let bg: string;
    let color: string;
    if (variant === 'primary') {
      bg = disabled ? 'rgba(229,9,20,0.4)' : '#e50914';
      color = '#fff';
    } else if (variant === 'danger') {
      bg = 'rgba(229,9,20,0.15)';
      color = '#e50914';
    } else {
      bg = 'rgba(255,255,255,0.1)';
      color = '#fff';
    }
    return {
      padding: '10px 24px',
      background: bg,
      color,
      border: variant === 'danger' ? '1px solid rgba(229,9,20,0.4)' : 'none',
      borderRadius: 4,
      fontSize: 14,
      fontWeight: 600,
      fontFamily: theme.typography.fontFamily,
      cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
      outline: isFocused ? '2px solid #fff' : 'none',
      outlineOffset: 2,
      transition: 'transform 150ms, background 150ms',
      transform: isFocused ? 'scale(1.03)' : 'scale(1)',
    };
  },

  textInput: (isFocused: boolean) => ({
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.08)',
    border: isFocused ? '2px solid #e50914' : '1px solid rgba(255,255,255,0.2)',
    borderRadius: 4,
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }),
});
