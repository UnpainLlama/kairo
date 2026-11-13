import { memo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectActivePage, selectNavFocused, selectNavIndex, selectInteractionMode } from '../state/selectors';
import { setInteractionMode } from '../state/slices/uiSlice';
import { NAV_ITEMS } from '../data/pageConfigs';
import { navStyles } from '../styles/componentStyles/navStyles';
import { useIsTvMode } from '../hooks/useMode';
import { useResponsive } from '../hooks/useResponsive';
import { usePageLoader } from '../hooks/usePageLoader';
import { useSettings } from '../hooks/useSettings';
import { useTvHint } from '../hooks/useTvHint';
import { AvatarDropdown } from './profile/AvatarDropdown';
import type { PageId, InteractionMode } from '../state/slices/uiSlice';

export const NavBar = memo(function NavBar() {
  const dispatch = useDispatch();
  const activePage = useSelector(selectActivePage);
  const navFocused = useSelector(selectNavFocused);
  const navIndex = useSelector(selectNavIndex);
  const interactionMode = useSelector(selectInteractionMode);
  const isTv = useIsTvMode();
  const { isMobile } = useResponsive();
  const loadPage = usePageLoader();
  const settings = useSettings();
  const showTvHint = useTvHint();

  // Nav clicks navigate in web/mobile, but in TV mode they're blocked
  // and trigger a hint toast instead — this is keyboard-only territory.
  const handleNavClick = useCallback((pageId: PageId) => {
    if (isTv) {
      showTvHint();
      return;
    }
    loadPage(pageId);
  }, [loadPage, isTv, showTvHint]);

  const handleModeToggle = useCallback(() => {
    const next: InteractionMode = interactionMode === 'tv' ? 'web' : 'tv';
    dispatch(setInteractionMode(next));
  }, [dispatch, interactionMode]);

  // Mobile: don't show nav bar (bottom tabs will be separate)
  if (isMobile) return null;

  return (
    <nav style={navStyles.container(isTv && navFocused)} role="navigation" aria-label="Main navigation">
      <div style={navStyles.logo}>J</div>
      <ul style={navStyles.navList}>
        {NAV_ITEMS.filter((item) => !(item.id === 'myList' && settings.disableMyList)).map((item, i) => {
          const isActive = activePage === item.id;
          const isFocused = isTv && navFocused && navIndex === i;

          return (
            <li
              key={item.id}
              style={navStyles.navItem(isActive, isFocused, !isTv)}
              onClick={() => handleNavClick(item.id)}
            >
              {item.id === 'search' ? (
                <span style={navStyles.searchLabel}>
                  <svg style={navStyles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="16.5" y1="16.5" x2="21" y2="21" />
                  </svg>
                  {item.label}
                </span>
              ) : (
                item.label
              )}
              <div style={navStyles.underline(isActive)} />
            </li>
          );
        })}
      </ul>
      {/* Web/TV toggle + avatar dropdown — desktop only */}
      <div style={{ ...navStyles.toggleContainer, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          style={navStyles.toggleButton(interactionMode)}
          onClick={handleModeToggle}
          aria-label={`Switch to ${interactionMode === 'tv' ? 'web' : 'TV'} mode`}
        >
          <span style={navStyles.toggleLabel(interactionMode === 'web')}>Web</span>
          <span style={navStyles.toggleLabel(interactionMode === 'tv')}>TV</span>
          <span style={navStyles.toggleSlider(interactionMode === 'tv')} />
        </button>
        <AvatarDropdown />
      </div>
    </nav>
  );
});
