import { memo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { theme } from '../styles/theme';
import { rowStyles } from '../styles/componentStyles/rowStyles';
import { ContentTile } from './ContentTile';
import { RowTitle } from './RowTitle';
import { selectFocus, selectHeroFocused, selectNavFocused, selectLastNavAction } from '../state/selectors';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { easeOutQuart } from '../engine/easing';
import { TILE_BUFFER, VISIBLE_TILES, TILE_STEP } from '../utils/constants';
import { useIsTvMode } from '../hooks/useMode';
import { useResponsive } from '../hooks/useResponsive';
import type { RowData } from '../state/slices/contentSlice';

interface ContentRowProps {
  row: RowData;
  rowIndex: number;
}

export const ContentRow = memo(function ContentRow({
  row,
  rowIndex,
}: ContentRowProps) {
  const focus = useSelector(selectFocus);
  const heroFocused = useSelector(selectHeroFocused);
  const navFocused = useSelector(selectNavFocused);
  const lastNavAction = useSelector(selectLastNavAction);
  const isTv = useIsTvMode();
  const { isMobile } = useResponsive();
  const isRowFocused = isTv && focus.rowIndex === rowIndex && !heroFocused && !navFocused;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Both default to false; useLayoutEffect computes the truth from DOM on mount.
  const [showLeftChevron, setShowLeftChevron] = useState(false);
  const [showRightChevron, setShowRightChevron] = useState(false);

  // ScrollEngine-driven horizontal scroll (TV mode)
  const scroll = useScrollAnimation(`row-${rowIndex}-scroll`, 0);
  const lastTileIndexRef = useRef(0);
  const targetOffsetRef = useRef(0);
  const prevTargetRef = useRef(0);

  if (isTv && isRowFocused) {
    const currTile = focus.tileIndex;
    const isHorizontalMove = lastNavAction === 'LEFT' || lastNavAction === 'RIGHT';

    if (isHorizontalMove && currTile !== lastTileIndexRef.current) {
      prevTargetRef.current = targetOffsetRef.current;
      const newTarget = Math.max(0, currTile - 1) * (theme.tile.width + theme.spacing.tileGap);
      targetOffsetRef.current = newTarget;
      scroll.animate(newTarget, 350, easeOutQuart, () => {
        prevTargetRef.current = targetOffsetRef.current;
      });
    }
    lastTileIndexRef.current = currTile;
  }

  // Web mode: chevron scroll
  const scrollBy = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const amount = theme.tile.width * 3 + theme.spacing.tileGap * 3;
    el.scrollBy({ left: direction === 'right' ? amount : -amount, behavior: 'smooth' });
  };

  const updateChevrons = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // With scrollPaddingLeft set, the start position is scrollLeft=0.
    const SLOP = 4;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const canScrollLeft = el.scrollLeft > SLOP;
    const canScrollRight = el.scrollLeft < maxScroll - SLOP;
    setShowLeftChevron(canScrollLeft);
    setShowRightChevron(canScrollRight);
  }, []);

  // Compute chevron visibility on mount, on row content change, and on viewport resize.
  // Don't run in TV mode (no chevrons rendered) or mobile (no chevrons rendered).
  useLayoutEffect(() => {
    if (isTv || isMobile) return;
    updateChevrons();
    window.addEventListener('resize', updateChevrons);
    return () => window.removeEventListener('resize', updateChevrons);
  }, [isTv, isMobile, row.tiles.length, updateChevrons]);

  // Web mode: native horizontal scroll
  if (!isTv) {
    const edgePad = isMobile ? 16 : theme.spacing.edgePadding;
    return (
      <div style={rowStyles.container} role="row" aria-label={row.title}>
        <RowTitle title={row.title} isRowFocused={false} paddingLeft={isMobile ? 16 : undefined} />
        <div
          style={rowStyles.webRowContainer}
          onMouseEnter={(e) => !isMobile && e.currentTarget.classList.add('row-hover')}
          onMouseLeave={(e) => !isMobile && e.currentTarget.classList.remove('row-hover')}
        >
          {/* Left chevron (desktop only) */}
          {!isMobile && showLeftChevron && (
            <button
              style={rowStyles.chevron('left')}
              onClick={() => scrollBy('left')}
              aria-label="Scroll left"
            >
              {'\u2039'}
            </button>
          )}
          <div
            ref={scrollContainerRef}
            style={{
              ...rowStyles.webTilesWrapper,
              paddingLeft: edgePad,
              paddingRight: edgePad,
              scrollPaddingLeft: edgePad,
              gap: isMobile ? 8 : theme.spacing.tileGap,
            }}
            onScroll={updateChevrons}
          >
            {row.tiles.map((tile, tileIndex) => (
              <ContentTile
                key={tile.id}
                tile={tile}
                tileIndex={tileIndex}
                isFocused={false}
                isRowFocused={false}
              />
            ))}
          </div>
          {/* Right chevron (desktop only) */}
          {!isMobile && showRightChevron && (
            <button
              style={rowStyles.chevron('right')}
              onClick={() => scrollBy('right')}
              aria-label="Scroll right"
            >
              {'\u203A'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // TV mode: engine-driven horizontal scroll with virtualization
  const scrollOffset = scroll.value;
  const tileCount = row.tiles.length;
  const minTilesForVirtualization = VISIBLE_TILES + TILE_BUFFER * 2 + 2;
  const shouldVirtualize = tileCount > minTilesForVirtualization;

  let startTile = 0;
  let endTile = tileCount - 1;

  if (shouldVirtualize) {
    const minOffset = Math.min(prevTargetRef.current, targetOffsetRef.current);
    const maxOffset = Math.max(prevTargetRef.current, targetOffsetRef.current);
    startTile = Math.max(0, Math.floor(minOffset / TILE_STEP) - TILE_BUFFER);
    endTile = Math.min(tileCount - 1, Math.ceil((maxOffset + window.innerWidth) / TILE_STEP) + TILE_BUFFER);
    if (isRowFocused) {
      startTile = Math.min(startTile, focus.tileIndex);
      endTile = Math.max(endTile, focus.tileIndex);
    }
  }

  const leftSpacer = startTile * TILE_STEP;
  const visibleTiles = row.tiles.slice(startTile, endTile + 1);

  return (
    <div style={rowStyles.container} role="row" aria-label={row.title}>
      <RowTitle title={row.title} isRowFocused={isRowFocused} />
      <div style={rowStyles.overflowWrapper}>
        <div style={rowStyles.tilesWrapper(scrollOffset)}>
          {leftSpacer > 0 && <div style={rowStyles.leftSpacer(leftSpacer)} />}
          {visibleTiles.map((tile, i) => {
            const tileIndex = startTile + i;
            return (
              <ContentTile
                key={tile.id}
                tile={tile}
                tileIndex={tileIndex}
                isFocused={isRowFocused && focus.tileIndex === tileIndex}
                isRowFocused={isRowFocused}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
