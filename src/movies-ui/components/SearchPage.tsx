import { type CSSProperties, memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { theme } from '../styles/theme';
import { selectSearchQuery, selectSearchResults, selectFocus, selectNavFocused } from '../state/selectors';
import { ContentRow } from './ContentRow';
import { KEYBOARD_GRID, KEYBOARD_COLS } from '../utils/constants';

const KEYBOARD_ROW_COUNT = Math.ceil(KEYBOARD_GRID.length / KEYBOARD_COLS);
const KEY_SIZE = 48;
const KEY_GAP = 4;

export const SearchPage = memo(function SearchPage() {
  const query = useSelector(selectSearchQuery);
  const results = useSelector(selectSearchResults);
  const focus = useSelector(selectFocus);
  const navFocused = useSelector(selectNavFocused);

  const isKeyboardFocused = !navFocused && focus.rowIndex >= 0 && focus.rowIndex < KEYBOARD_ROW_COUNT;
  const focusedKeyRow = isKeyboardFocused ? focus.rowIndex : -1;
  const focusedKeyCol = isKeyboardFocused ? focus.tileIndex : -1;

  const resultRowOffset = KEYBOARD_ROW_COUNT;

  const focusedKeyLabel = useMemo(() => {
    if (!isKeyboardFocused) return '';
    const idx = focusedKeyRow * KEYBOARD_COLS + focusedKeyCol;
    const key = KEYBOARD_GRID[idx];
    if (!key) return '';
    return key === 'SPACE' ? '␣' : key;
  }, [isKeyboardFocused, focusedKeyRow, focusedKeyCol]);

  const containerStyle: CSSProperties = {
    paddingTop: theme.spacing.headerHeight + 20,
    paddingLeft: theme.spacing.edgePadding,
    paddingRight: theme.spacing.edgePadding,
    paddingBottom: 200,
  };

  const queryDisplayStyle: CSSProperties = {
    fontSize: 28,
    fontWeight: 600,
    color: theme.colors.text,
    marginBottom: 24,
    fontFamily: theme.typography.fontFamily,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  };

  const queryTextStyle: CSSProperties = {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    minWidth: 200,
    minHeight: 40,
    display: 'flex',
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,0.2)',
  };

  const cursorStyle: CSSProperties = {
    width: 2,
    height: 24,
    background: theme.colors.text,
    animation: 'blink 1s step-end infinite',
    marginLeft: 2,
  };

  const keyboardStyle: CSSProperties = {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: `repeat(${KEYBOARD_COLS}, ${KEY_SIZE}px)`,
    gap: KEY_GAP,
    marginBottom: 40,
  };

  const focusOverlayStyle: CSSProperties = isKeyboardFocused ? {
    position: 'absolute',
    top: focusedKeyRow * (KEY_SIZE + KEY_GAP),
    left: focusedKeyCol * (KEY_SIZE + KEY_GAP),
    width: KEY_SIZE,
    height: KEY_SIZE,
    background: 'rgba(255,255,255,0.25)',
    border: '2px solid rgba(255,255,255,0.4)',
    borderRadius: 4,
    transform: 'scale(1.1)',
    zIndex: 2,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: focusedKeyLabel.length > 1 ? 11 : 18,
    fontWeight: 500,
    fontFamily: theme.typography.fontFamily,
  } : { display: 'none' };

  const emptyStyle: CSSProperties = {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.typography.fontFamily,
    paddingTop: 40,
  };

  return (
    <div style={containerStyle}>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>

      <div style={queryDisplayStyle}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: theme.colors.textSecondary }}>
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <div style={queryTextStyle}>
          <span>{query}</span>
          <div style={cursorStyle} />
        </div>
      </div>

      <div style={keyboardStyle}>
        <div style={focusOverlayStyle}>{focusedKeyLabel}</div>

        {KEYBOARD_GRID.map((key, i) => {
          const label = key === 'SPACE' ? '␣' : key;

          const keyStyle: CSSProperties = {
            width: KEY_SIZE,
            height: KEY_SIZE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)',
            borderRadius: 4,
            fontSize: key.length > 1 ? 11 : 18,
            fontWeight: 500,
            fontFamily: theme.typography.fontFamily,
            cursor: 'default',
          };

          return (
            <div key={`${key}-${i}`} style={keyStyle}>
              {label}
            </div>
          );
        })}
      </div>

      <div style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: theme.spacing.rowGap }}>
        {query && results.length === 0 && (
          <div style={emptyStyle}>No results found for "{query}"</div>
        )}
        {!query && (
          <div style={emptyStyle}>Type to search for movies and TV shows</div>
        )}
        {results.map((row, i) => (
          <ContentRow
            key={row.id}
            row={row}
            rowIndex={resultRowOffset + i}
          />
        ))}
      </div>
    </div>
  );
});
