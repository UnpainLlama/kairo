import { memo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { selectActivePage } from '../state/selectors';
import { usePageLoader } from '../hooks/usePageLoader';
import { useSettings } from '../hooks/useSettings';
import { useCurrentProfile } from '../hooks/useProfile';
import { theme } from '../styles/theme';
import { AvatarDropdown } from './profile/AvatarDropdown';
import type { PageId } from '../state/slices/uiSlice';
import type { CSSProperties } from 'react';

interface Tab {
  id: PageId;
  label: string;
  icon: string;
}

const ALL_TABS: Tab[] = [
  { id: 'home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
  { id: 'search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { id: 'newPopular', label: 'New & Hot', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  { id: 'myList', label: 'My List', icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' },
];

export const MobileNavBar = memo(function MobileNavBar() {
  const activePage = useSelector(selectActivePage);
  const loadPage = usePageLoader();
  const settings = useSettings();
  const currentProfile = useCurrentProfile();

  const handleTab = useCallback((id: PageId) => {
    loadPage(id);
    window.scrollTo({ top: 0 });
  }, [loadPage]);

  const tabs = ALL_TABS.filter((t) => !(t.id === 'myList' && settings.disableMyList));

  const bar: CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 56,
    background: 'rgba(20,20,20,0.95)',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    fontFamily: theme.typography.fontFamily,
    backdropFilter: 'blur(12px)',
  };

  return (
    <nav style={bar} role="navigation" aria-label="Mobile navigation">
      {tabs.map((tab) => {
        const isActive = activePage === tab.id;
        const tabStyle: CSSProperties = {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          padding: '6px 12px',
          background: 'none',
          border: 'none',
          color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
          fontSize: 10,
          fontWeight: isActive ? 600 : 400,
          fontFamily: theme.typography.fontFamily,
          cursor: 'pointer',
          transition: 'color 150ms',
        };

        return (
          <button key={tab.id} style={tabStyle} onClick={() => handleTab(tab.id)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        );
      })}
      {/* Profile/account button at the right */}
      {currentProfile && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 12px' }}>
          <AvatarDropdown />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>You</span>
        </div>
      )}
    </nav>
  );
});
