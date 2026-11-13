import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const authStyles = createStyles({
  fullscreen: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 200,
    background: theme.colors.background,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontFamily: theme.typography.fontFamily,
  },

  // --- Desktop / Web ---
  desktopCard: {
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    padding: '48px 56px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
  },

  // --- Mobile ---
  mobileContainer: {
    width: '100%',
    minHeight: '100vh',
    padding: '24px 20px',
    background: theme.colors.background,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },

  // --- TV ---
  tvCard: {
    background: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    padding: '56px 64px',
    width: '100%',
    maxWidth: 540,
    boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
  },

  // Brand mark
  logo: {
    color: '#e50914',
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: -1,
    marginBottom: 32,
    textAlign: 'left' as const,
  },

  // Tab toggle (Sign Up / Log In)
  tabRow: {
    display: 'flex' as const,
    gap: 0,
    marginBottom: 28,
    borderBottom: '1px solid rgba(255,255,255,0.15)',
  },

  tab: (isActive: boolean, isFocused: boolean) => ({
    flex: 1,
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    color: isActive ? theme.colors.text : 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontWeight: isActive ? 600 : 400,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer' as const,
    borderBottom: isActive ? '2px solid #e50914' : '2px solid transparent',
    outline: isFocused ? '2px solid #fff' : 'none',
    outlineOffset: '-2px',
    transition: 'color 150ms, border-color 150ms',
  }),

  // Form fields
  fieldLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 6,
    fontFamily: theme.typography.fontFamily,
  },

  textInput: (isFocused: boolean) => ({
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: isFocused ? '2px solid #e50914' : '1px solid rgba(255,255,255,0.2)',
    borderRadius: 4,
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    transition: 'border-color 150ms, background 150ms',
    boxSizing: 'border-box' as const,
  }),

  helperText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 8,
    fontFamily: theme.typography.fontFamily,
  },

  errorText: {
    color: '#e87c03',
    fontSize: 13,
    marginTop: 8,
    fontFamily: theme.typography.fontFamily,
  },

  // Primary button
  submitButton: (isFocused: boolean, disabled: boolean) => ({
    width: '100%',
    padding: '12px 16px',
    marginTop: 24,
    background: disabled ? 'rgba(229, 9, 20, 0.4)' : '#e50914',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: theme.typography.fontFamily,
    cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
    outline: isFocused ? '2px solid #fff' : 'none',
    outlineOffset: 2,
    transition: 'background 150ms, transform 150ms',
    transform: isFocused ? 'scale(1.02)' : 'scale(1)',
  }),

  // Existing account list (Log In tab)
  accountList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
    marginTop: 4,
  },

  accountRow: (isFocused: boolean) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '12px 16px',
    background: isFocused ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
    border: isFocused ? '2px solid #e50914' : '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4,
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer' as const,
    transition: 'background 150ms, border-color 150ms',
    width: '100%',
    textAlign: 'left' as const,
  }),

  accountChevron: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
  },

  emptyState: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center' as const,
    padding: '24px 0',
    fontFamily: theme.typography.fontFamily,
  },
});
