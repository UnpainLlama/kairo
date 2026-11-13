import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const settingsStyles = createStyles({
  page: {
    width: '100%',
    minHeight: '100vh',
    paddingTop: theme.spacing.headerHeight + 24,
    paddingBottom: 80,
    fontFamily: theme.typography.fontFamily,
  },

  // Two-column layout for desktop
  desktopContainer: {
    display: 'flex' as const,
    maxWidth: 1100,
    margin: '0 auto',
    padding: '0 56px',
    gap: 48,
  },

  desktopRail: {
    width: 220,
    flexShrink: 0,
    position: 'sticky' as const,
    top: theme.spacing.headerHeight + 24,
    alignSelf: 'flex-start' as const,
  },

  desktopMain: {
    flex: 1,
    minWidth: 0,
  },

  // Mobile/TV: single column
  singleContainer: {
    width: '100%',
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 20px',
  },

  pageTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: theme.colors.text,
    marginBottom: 24,
    fontFamily: theme.typography.fontFamily,
  },

  railLink: (isActive: boolean) => ({
    display: 'block' as const,
    padding: '8px 12px',
    borderRadius: 4,
    color: isActive ? theme.colors.text : 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: isActive ? 600 : 400,
    background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
    textDecoration: 'none' as const,
    cursor: 'pointer' as const,
    border: 'none',
    width: '100%',
    textAlign: 'left' as const,
    fontFamily: theme.typography.fontFamily,
    transition: 'background 150ms, color 150ms',
  }),

  section: {
    marginBottom: 40,
  },

  sectionHeader: {
    fontSize: 20,
    fontWeight: 600,
    color: theme.colors.text,
    marginBottom: 16,
    paddingBottom: 8,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    fontFamily: theme.typography.fontFamily,
  },

  // Setting row (toggle or button)
  row: (isFocused: boolean) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '14px 16px',
    background: isFocused ? 'rgba(255,255,255,0.08)' : 'transparent',
    border: isFocused ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
    borderRadius: 6,
    transition: 'background 150ms, border-color 150ms',
    fontFamily: theme.typography.fontFamily,
  }),

  rowLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: 500,
    fontFamily: theme.typography.fontFamily,
  },

  rowDescription: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
  },

  rowControl: {
    flexShrink: 0,
    marginLeft: 16,
  },

  // Toggle switch (iOS-style)
  toggle: (isOn: boolean) => ({
    position: 'relative' as const,
    width: 44,
    height: 24,
    borderRadius: 12,
    background: isOn ? '#46d369' : 'rgba(255,255,255,0.2)',
    border: 'none',
    cursor: 'pointer' as const,
    transition: 'background 200ms ease-out',
    padding: 0,
  }),

  toggleKnob: (isOn: boolean) => ({
    position: 'absolute' as const,
    top: 2,
    left: isOn ? 22 : 2,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 200ms ease-out',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  }),

  // Inline button for actions like "Change Username"
  rowButton: (variant: 'primary' | 'secondary' | 'danger') => {
    let bg: string;
    let color: string;
    let border: string;
    if (variant === 'primary') { bg = '#e50914'; color = '#fff'; border = 'none'; }
    else if (variant === 'danger') { bg = 'rgba(229,9,20,0.1)'; color = '#e50914'; border = '1px solid rgba(229,9,20,0.4)'; }
    else { bg = 'rgba(255,255,255,0.1)'; color = '#fff'; border = '1px solid rgba(255,255,255,0.2)'; }
    return {
      padding: '6px 16px',
      background: bg,
      color,
      border,
      borderRadius: 4,
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer' as const,
      fontFamily: theme.typography.fontFamily,
      transition: 'background 150ms, transform 150ms',
    };
  },

  rowValue: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontFamily: theme.typography.fontFamily,
  },

  // Username inline editor
  inlineEditor: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
  },

  inlineInput: {
    padding: '6px 10px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 4,
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily,
    width: 200,
  },

  // Confirm dialog (for delete account)
  confirmBox: {
    background: 'rgba(229,9,20,0.05)',
    border: '1px solid rgba(229,9,20,0.3)',
    padding: 16,
    borderRadius: 6,
    color: theme.colors.text,
    fontSize: 13,
    fontFamily: theme.typography.fontFamily,
  },

  confirmActions: {
    display: 'flex' as const,
    gap: 8,
    marginTop: 12,
  },

  // Banner for export success / generic info
  banner: {
    background: 'rgba(70,211,105,0.1)',
    border: '1px solid rgba(70,211,105,0.3)',
    padding: 12,
    borderRadius: 4,
    color: '#46d369',
    fontSize: 13,
    marginBottom: 16,
    fontFamily: theme.typography.fontFamily,
  },
});
