import { createStyles } from '../styleEngine';
import { theme } from '../theme';

export const hudStyles = createStyles({
  container: {
    position: 'fixed',
    // Sit just below the top nav bar so it doesn't cover navigation.
    top: theme.spacing.headerHeight + 12,
    right: 12,
    zIndex: 9999,
    background: 'rgba(10, 10, 10, 0.86)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    padding: '10px 12px 8px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.4,
    pointerEvents: 'auto',
    minWidth: 200,
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
    userSelect: 'none',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },

  title: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.55)',
  },

  hideButton: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.16)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    fontFamily: 'inherit',
    padding: '3px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    letterSpacing: 0.5,
  },

  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: '2px 0',
  },

  rowLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },

  rowValue: {
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    fontSize: 11,
  },

  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    margin: '6px 0',
  },

  footer: {
    marginTop: 8,
    paddingTop: 6,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
