import { useState, useEffect, useCallback } from 'react';
import { theme } from '../styles/theme';
import { useIsTvMode } from '../hooks/useMode';
import type { CSSProperties } from 'react';

const SESSION_KEY = 'tv-ui-welcome-shown';

export function WelcomeModal() {
  const isTv = useIsTvMode();
  const [visible, setVisible] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    if (!isTv) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    setVisible(true);
    requestAnimationFrame(() => setFadeIn(true));
  }, [isTv]);

  const dismiss = useCallback(() => {
    setFadeIn(false);
    setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem(SESSION_KEY, '1');
    }, 300);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, dismiss]);

  if (!visible) return null;

  const backdrop: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: fadeIn ? 1 : 0,
    transition: 'opacity 300ms ease-out',
  };

  const card: CSSProperties = {
    background: theme.colors.surface,
    borderRadius: 12,
    padding: '40px 48px',
    maxWidth: 480,
    width: '90%',
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    transform: fadeIn ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(16px)',
    transition: 'transform 300ms ease-out',
  };

  const title: CSSProperties = {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: theme.typography.fontWeightBold,
    marginBottom: 20,
  };

  const desc: CSSProperties = {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 1.6,
    marginBottom: 28,
  };

  const keysRow: CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 28,
  };

  const keyGroup: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  };

  const keyBadge: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 8,
    border: '1.5px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: theme.typography.fontWeightSemibold,
    fontFamily: theme.typography.fontFamily,
  };

  const keyLabel: CSSProperties = {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: theme.typography.fontWeightMedium,
    fontFamily: theme.typography.fontFamily,
  };

  const button: CSSProperties = {
    padding: '12px 40px',
    borderRadius: 4,
    border: 'none',
    background: '#fff',
    color: '#000',
    fontSize: 15,
    fontWeight: theme.typography.fontWeightSemibold,
    fontFamily: theme.typography.fontFamily,
    cursor: 'pointer',
    transition: 'transform 150ms ease-out',
  };

  const hint: CSSProperties = {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 14,
    fontFamily: theme.typography.fontFamily,
  };

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={title}>TV Interface</div>
        <div style={desc}>
          This app is built like a TV streaming interface.
          Navigate using your keyboard just like a remote control.
        </div>
        <div style={keysRow}>
          <div style={keyGroup}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={keyBadge}>{'\u2191'}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={keyBadge}>{'\u2190'}</div>
                <div style={keyBadge}>{'\u2193'}</div>
                <div style={keyBadge}>{'\u2192'}</div>
              </div>
            </div>
            <div style={keyLabel}>Navigate</div>
          </div>
          <div style={keyGroup}>
            <div style={{ ...keyBadge, width: 72 }}>Enter</div>
            <div style={keyLabel}>Select</div>
          </div>
          <div style={keyGroup}>
            <div style={{ ...keyBadge, width: 52 }}>Esc</div>
            <div style={keyLabel}>Back</div>
          </div>
        </div>
        <button style={button} onClick={dismiss}>Got it</button>
        <div style={hint}>Press Enter or Esc to dismiss</div>
      </div>
    </div>
  );
}
