import { type CSSProperties, memo } from 'react';
import { useSelector } from 'react-redux';
import { theme } from '../styles/theme';
import {
  selectFocus,
  selectNavFocused,
  selectWatchlist,
} from '../state/selectors';
import { getTileImageUrl } from '../data/mockContent';
import { getTmdbBackdropUrl, getTmdbLogoUrl } from '../data/tmdb';

export const MyListPage = memo(function MyListPage() {
  const focus = useSelector(selectFocus);
  const navFocused = useSelector(selectNavFocused);
  const items = useSelector(selectWatchlist);

  const isEmpty = items.length === 0;

  // Row 0: empty → Browse CTA, populated → tiles
  // Row 1: Clear All Data button (always)
  const browseCtaFocused =
    !navFocused && isEmpty && focus.rowIndex === 0 && focus.tileIndex === 0;
  const clearFocused =
    !navFocused && focus.rowIndex === 1 && focus.tileIndex === 0;

  const containerStyle: CSSProperties = {
    paddingTop: theme.spacing.headerHeight + 40,
    paddingLeft: theme.spacing.edgePadding,
    paddingRight: theme.spacing.edgePadding,
    fontFamily: theme.typography.fontFamily,
    minHeight: '100vh',
  };

  const headingStyle: CSSProperties = {
    fontSize: 28,
    fontWeight: theme.typography.fontWeightBold,
    color: theme.colors.text,
    marginBottom: 24,
  };

  const tilesRowStyle: CSSProperties = {
    display: 'flex',
    gap: theme.spacing.tileGap,
    marginBottom: 48,
    flexWrap: 'wrap',
  };

  const tileStyle = (focused: boolean): CSSProperties => ({
    width: theme.tile.width,
    height: theme.tile.height,
    borderRadius: theme.tile.borderRadius,
    overflow: 'hidden',
    position: 'relative',
    transform: focused ? 'scale(1.1)' : 'scale(1)',
    filter: focused ? 'brightness(1)' : 'brightness(0.7)',
    boxShadow: focused ? '0 8px 24px rgba(0,0,0,0.6)' : 'none',
    transition: 'all 200ms ease-out',
    flexShrink: 0,
  });

  const tileImgStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  const tileLogoStyle: CSSProperties = {
    position: 'absolute',
    bottom: 8,
    left: 8,
    maxWidth: '55%',
    maxHeight: '40%',
    objectFit: 'contain',
  };

  const button = (focused: boolean): CSSProperties => ({
    display: 'inline-block',
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: theme.typography.fontWeightSemibold,
    fontFamily: theme.typography.fontFamily,
    color: focused ? '#000' : '#fff',
    background: focused ? '#fff' : 'rgba(255,255,255,0.15)',
    border: 'none',
    borderRadius: 4,
    cursor: 'default',
    transform: focused ? 'scale(1.05)' : 'scale(1)',
    boxShadow: focused ? '0 4px 16px rgba(255,255,255,0.2)' : 'none',
    transition: 'all 200ms ease-out',
  });

  const sectionStyle: CSSProperties = {
    marginTop: 16,
    paddingTop: 32,
    borderTop: '1px solid rgba(255,255,255,0.08)',
  };

  const sectionLabelStyle: CSSProperties = {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  };

  const emptyWrap: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingTop: 40,
    paddingBottom: 48,
  };

  return (
    <div style={containerStyle}>
      <div style={headingStyle}>My List</div>

      {isEmpty ? (
        <div style={emptyWrap}>
          <div style={{ fontSize: 16, color: theme.colors.textSecondary, marginBottom: 24 }}>
            Your list is empty. Add movies and shows from the detail view.
          </div>
          <div style={button(browseCtaFocused)} role="button" aria-label="Browse content">
            Browse Content
          </div>
        </div>
      ) : (
        <div style={tilesRowStyle}>
          {items.map((tile, i) => {
            const focused =
              !navFocused && focus.rowIndex === 0 && focus.tileIndex === i;
            const bg = tile.backdropPath
              ? getTmdbBackdropUrl(tile.backdropPath)
              : getTileImageUrl(tile.imageIndex);
            return (
              <div key={tile.id} style={tileStyle(focused)} role="gridcell" aria-label={tile.title}>
                <img src={bg} alt={tile.title} style={tileImgStyle} />
                {tile.logoPath && (
                  <img src={getTmdbLogoUrl(tile.logoPath, 'w300')} alt="" style={tileLogoStyle} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Your data</div>
        <div style={button(clearFocused)} role="button" aria-label="Clear all saved data">
          Clear All Saved Data
        </div>
        <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 8 }}>
          Removes your watchlist and any other locally stored preferences.
        </div>
      </div>
    </div>
  );
});
