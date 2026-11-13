import { useRef, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { theme } from '../styles/theme';
import { shellStyles } from '../styles/componentStyles/shellStyles';
import { selectRows, selectFocus, selectActivePage, selectNavFocused, selectHeroFocused } from '../state/selectors';
import { ContentRow } from './ContentRow';
import { HeroBanner } from './HeroBanner';
import { DetailOverlay } from './DetailOverlay';
import { NavBar } from './NavBar';
import { MobileNavBar } from './MobileNavBar';
import { SearchPage } from './SearchPage';
import { MyListPage } from './MyListPage';
import { SettingsPage } from './settings/SettingsPage';
import { PerformanceHUD } from './PerformanceHUD';
import { WelcomeModal } from './WelcomeModal';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { easeOutQuint } from '../engine/easing';
import { useResponsive } from '../hooks/useResponsive';
import { KEYBOARD_GRID, KEYBOARD_COLS, ROW_BUFFER } from '../utils/constants';
import { useIsTvMode } from '../hooks/useMode';
import { useSettings } from '../hooks/useSettings';
import { useDispatch } from 'react-redux';
import { setActivePage } from '../state/slices/uiSlice';

const KEYBOARD_ROW_COUNT = Math.ceil(KEYBOARD_GRID.length / KEYBOARD_COLS);
const HERO_SLOT_HEIGHT = '56vh';

export function Shell() {
  const rows = useSelector(selectRows);
  const focus = useSelector(selectFocus);
  const activePage = useSelector(selectActivePage);
  const navFocused = useSelector(selectNavFocused);
  const heroFocused = useSelector(selectHeroFocused);
  const shellRef = useRef<HTMLDivElement>(null);
  const isTv = useIsTvMode();
  const { isMobile } = useResponsive();
  const settings = useSettings();
  const dispatch = useDispatch();

  const isSearch = activePage === 'search';
  const isMyList = activePage === 'myList';
  const isSettings = activePage === 'settings';

  // If My List is disabled and user is on it, bounce them home
  useEffect(() => {
    if (isMyList && settings.disableMyList) {
      dispatch(setActivePage('home'));
    }
  }, [isMyList, settings.disableMyList, dispatch]);

  // ScrollEngine-driven vertical scroll (TV mode only)
  const contentScroll = useScrollAnimation('vertical-content', 0);
  const searchScroll = useScrollAnimation('vertical-search', 0);

  useEffect(() => {
    if (!isSearch && shellRef.current) {
      shellRef.current.scrollTop = 0;
    }
  }, [isSearch]);

  // --- Vertical virtualization: deferred unmount (TV mode) ---
  const prevRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: ROW_BUFFER + 2 });
  const [deferredRange, setDeferredRange] = useState<{ start: number; end: number } | null>(null);

  const anchorRow = (!isSearch && !isMyList && (heroFocused || navFocused)) ? 0 : focus.rowIndex;
  useEffect(() => {
    if (!isTv || isSearch || isMyList) return;
    const newStart = Math.max(0, anchorRow - ROW_BUFFER);
    const newEnd = Math.min(rows.length - 1, anchorRow + ROW_BUFFER + ((heroFocused || navFocused) ? 2 : 0));
    const prev = prevRangeRef.current;

    if (newStart !== prev.start || newEnd !== prev.end) {
      setDeferredRange(prev);
      prevRangeRef.current = { start: newStart, end: newEnd };
    }
  }, [anchorRow, heroFocused, navFocused, rows.length, isSearch, isMyList, isTv]);

  // Vertical scroll offset (TV mode only)
  const rowHeight = theme.tile.height + 40 + theme.spacing.rowGap;
  let targetOffset = 0;

  if (isTv) {
    if (isSearch && !navFocused) {
      const isInResults = focus.rowIndex >= KEYBOARD_ROW_COUNT;
      if (isInResults) {
        const resultIdx = focus.rowIndex - KEYBOARD_ROW_COUNT;
        const keyboardHeight = KEYBOARD_ROW_COUNT * (48 + 4) + 40;
        const searchBarHeight = 80;
        const headerPad = theme.spacing.headerHeight + 20;
        const resultsTop = headerPad + searchBarHeight + keyboardHeight;
        targetOffset = resultsTop - (rowHeight * 1.5) + Math.max(0, resultIdx) * rowHeight;
        targetOffset = Math.max(0, targetOffset);
      }
    } else if (!isSearch && !isMyList && !heroFocused && focus.rowIndex >= 0) {
      targetOffset = Math.max(0, focus.rowIndex) * rowHeight;
    }
  }

  const prevTargetRef = useRef(targetOffset);
  useEffect(() => {
    if (!isTv) return;
    if (prevTargetRef.current !== targetOffset) {
      prevTargetRef.current = targetOffset;
      const scroll = isSearch ? searchScroll : contentScroll;
      scroll.animate(targetOffset, 450, easeOutQuint, () => {
        setDeferredRange(null);
      });
    }
  }, [targetOffset, isSearch, contentScroll, searchScroll, isTv]);

  // --- Web mode: simple layout ---
  if (!isTv) {
    return (
      <div ref={shellRef} style={shellStyles.webShell} aria-label="Content browser">
        {!isMobile && <NavBar />}
        {isSearch ? (
          <div style={{ paddingTop: isMobile ? 0 : theme.spacing.headerHeight }}>
            <SearchPage />
          </div>
        ) : isMyList ? (
          <MyListPage />
        ) : isSettings ? (
          <SettingsPage />
        ) : (
          <>
            {!isMobile && <HeroBanner />}
            {isMobile && <div style={{ height: 8 }} />}
            <div style={isMobile ? shellStyles.mobileRowsContainer : shellStyles.webRowsContainer}>
              {rows.map((row, idx) => (
                <ContentRow key={row.id} row={row} rowIndex={idx} />
              ))}
            </div>
          </>
        )}
        <DetailOverlay />
        <PerformanceHUD />
        {isMobile && <MobileNavBar />}
        {/* Bottom padding for mobile nav bar */}
        {isMobile && <div style={{ height: 64 }} />}
      </div>
    );
  }

  // --- TV mode: engine-driven layout ---
  return (
    <div ref={shellRef} style={shellStyles.shell} role="grid" aria-label="Content browser">
      <NavBar />
      {isSearch ? (
        <div style={shellStyles.scrollContainer(searchScroll.value)}>
          <SearchPage />
        </div>
      ) : isMyList ? (
        <MyListPage />
      ) : isSettings ? (
        <SettingsPage />
      ) : (
        <>
          <div style={{ height: HERO_SLOT_HEIGHT, overflow: 'hidden', flexShrink: 0 }}>
            <HeroBanner />
          </div>
          <div style={shellStyles.scrollContainer(contentScroll.value)}>
            <div style={shellStyles.rowsContainer(rows.length * rowHeight)}>
              {(() => {
                const anchorRow = (heroFocused || navFocused) ? 0 : focus.rowIndex;
                const newStart = Math.max(0, anchorRow - ROW_BUFFER);
                const newEnd = Math.min(rows.length - 1, anchorRow + ROW_BUFFER + ((heroFocused || navFocused) ? 2 : 0));
                const startRow = deferredRange ? Math.min(newStart, deferredRange.start) : newStart;
                const endRow = deferredRange ? Math.max(newEnd, deferredRange.end) : newEnd;

                return rows.slice(startRow, endRow + 1).map((row, i) => {
                  const idx = startRow + i;
                  return (
                    <div key={row.id} style={shellStyles.rowWrapper(idx * rowHeight)}>
                      <ContentRow row={row} rowIndex={idx} />
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </>
      )}
      <DetailOverlay />
      <PerformanceHUD />
      <WelcomeModal />
    </div>
  );
}
