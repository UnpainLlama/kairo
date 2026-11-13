import { useSelector } from 'react-redux';
import type { CSSProperties } from 'react';
import type { RootState } from '../state/store';
import { theme } from '../styles/theme';

export function TvHintToast() {
  const visible = useSelector((s: RootState) => s.ui.tvHintVisible);

  const wrapper: CSSProperties = {
    position: 'fixed',
    top: 88,
    left: '50%',
    transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, -16px)',
    zIndex: 300,
    opacity: visible ? 1 : 0,
    pointerEvents: 'none',
    transition: 'opacity 200ms ease-out, transform 200ms ease-out',
  };

  const card: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 18px',
    borderRadius: 6,
    background: 'rgba(20, 20, 20, 0.95)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.typography.fontFamily,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    whiteSpace: 'nowrap',
  };

  const kbd: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px 8px',
    borderRadius: 3,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.25)',
    fontSize: 12,
    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
    color: '#fff',
  };

  return (
    <div style={wrapper} aria-live="polite" aria-atomic="true">
      <div style={card}>
        <span>TV mode — use</span>
        <span style={kbd}>{'\u2190 \u2191 \u2192 \u2193'}</span>
        <span>and</span>
        <span style={kbd}>Enter</span>
      </div>
    </div>
  );
}
