import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CalendarDays, ChevronRight, Compass, Film, Flame, History, ListVideo,
  LogIn, Menu, PlayCircle, Search, Settings, Tv, UserRound, Users, Youtube,
  type LucideIcon,
} from 'lucide-react';
import SearchBar from './components/SearchBar';
import HomePage from './pages/HomePage';
import YouTubeFeedPage from './pages/YouTubeFeedPage';
import YouTubeSearchPage from './pages/YouTubeSearchPage';
import YouTubeChannelsPage from './pages/YouTubeChannelsPage';
import SearchPage from './pages/SearchPage';
import BrowsePage from './pages/BrowsePage';
import AnimePage from './pages/AnimePage';
import WatchPage from './pages/WatchPage';
import AuthPage from './pages/AuthPage';
import { AboutPage, AccountPage, HistoryPage, NotFoundPage, ProfilePage } from './pages/StaticPages';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; active?: boolean };

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/browse/trending', label: 'Trending', icon: Flame },
  { to: '/browse/anime', label: 'Discover', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/browse/seasonal', label: 'Seasonal', icon: CalendarDays },
  { to: '/history', label: 'History', icon: History },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

const menuItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/browse/trending', label: 'Trending', icon: Flame },
  { to: '/browse/anime', label: 'Anime', icon: Tv },
  { to: '/browse/movies', label: 'Movies', icon: Film },
  { to: '/browse/anime', label: 'Discover', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/browse/seasonal', label: 'Seasonal', icon: CalendarDays },
  { to: '/history', label: 'History', icon: History },
];

const youtubeNavItems: NavItem[] = [
  { to: '/youtube', label: 'Home', icon: PlayCircle, end: true },
  { to: '/youtube/search', label: 'Discover', icon: Compass },
  { to: '/youtube/channels', label: 'Channels', icon: ListVideo },
];

const mobileNavItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/browse/anime', label: 'Discover', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/history', label: 'History', icon: History },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

function RailLink({ to, label, icon: Icon, end, active }: NavItem) {
  return (
    <NavLink to={to} end={end} aria-label={label} className={({ isActive }) => `kc-rail-link${(active ?? isActive) ? ' active' : ''}`}>
      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      <span className="kc-rail-tooltip" aria-hidden="true">{label}</span>
    </NavLink>
  );
}

function MenuLink({ to, label, icon: Icon, end, onNavigate }: NavItem & { onNavigate: () => void }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `kc-menu-tile${isActive ? ' active' : ''}`} onClick={onNavigate}>
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>{label}</span>
      <ChevronRight size={13} className="kc-menu-chevron" aria-hidden="true" />
    </NavLink>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const isYouTubeMode = pathname.startsWith('/youtube');
  const activeNavItems = isYouTubeMode ? youtubeNavItems : navItems;
  const activeMenuItems = isYouTubeMode
    ? [...youtubeNavItems, { to: '/', label: 'Anime', icon: Tv, end: true }]
    : menuItems;
  const activeMobileItems = isYouTubeMode ? youtubeNavItems : mobileNavItems;
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{displayName:string;email:string|null}|null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  useEffect(() => {
    let active=true;
    const refresh=()=>{fetch('/api/v1/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(p=>{if(active)setCurrentUser(p?.data?.user??null)}).catch(()=>{if(active)setCurrentUser(null)})};
    refresh(); window.addEventListener('kairo:auth-change',refresh);
    return()=>{active=false;window.removeEventListener('kairo:auth-change',refresh)};
  }, [pathname]);

  const logout = async () => {
    setAuthBusy(true);
    try { const response=await fetch('/api/v1/auth/logout',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}}); const payload=await response.json().catch(()=>null); if(!response.ok||!payload?.success) throw new Error(payload?.error?.message??'Could not sign out.'); setCurrentUser(null); window.dispatchEvent(new Event('kairo:auth-change')); setMenuOpen(false); navigate('/login'); }
    catch(error) { window.alert(error instanceof Error?error.message:'Could not sign out.'); } finally { setAuthBusy(false); }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = (_event?: MouseEvent<HTMLAnchorElement>) => setMenuOpen(false);

  return (
    <div className={`kc-app${pathname === '/' ? ' kc-home-view' : ''}${isYouTubeMode ? ' yt-app' : ''}`}>
      <a className="kc-skip" href="#main">Skip to content</a>

      <aside className="kc-rail" aria-label="Primary">
        <Link to="/" className="kc-brand" aria-label="Kairo home"><img src="/kairo-k.svg" alt="" width="22" height="26" /></Link>
        <nav className="kc-rail-links" aria-label="Main navigation">
          {activeNavItems.map((item) => <RailLink key={item.label} {...item} />)}
        </nav>
        <div className="kc-rail-bottom">
          <RailLink to="/settings" label="Settings" icon={Settings} />
          <RailLink to={currentUser ? "/profile" : "/login"} label={currentUser ? "Account" : "Login"} icon={currentUser ? UserRound : LogIn} active={false} />
        </div>
      </aside>

      <header className="kc-topbar">
        <div className="kc-topbar-inner">
          <SearchBar mode={isYouTubeMode ? 'youtube' : 'anime'} />
          <div className="kc-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className={`kc-menu-trigger${menuOpen ? ' active' : ''}`}
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="kc-navigation-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Menu size={19} aria-hidden="true" />
            </button>
            {menuOpen && (
              <section className="kc-menu-popover" id="kc-navigation-menu" aria-label="Kairo navigation menu">
                <Link to={currentUser ? "/profile" : "/login"} className="kc-menu-profile" onClick={closeMenu}>
                  <span className="kc-menu-avatar"><UserRound size={19} aria-hidden="true" /></span>
                  <span><b>{currentUser?.displayName ?? 'Profile'}</b><small>{currentUser?.email ?? 'Guest account'}</small></span>
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
                <div className="kc-menu-section-label">{isYouTubeMode ? 'Video' : 'Media'}</div>
                <div className="kc-menu-grid">
                  {activeMenuItems.slice(0, isYouTubeMode ? 3 : 4).map((item) => <MenuLink key={item.label} {...item} onNavigate={closeMenu} />)}
                  <NavLink to={isYouTubeMode ? '/' : '/youtube'} className={({ isActive }) => `kc-menu-tile${isActive ? ' active' : ''}`} onClick={closeMenu}>
                    {isYouTubeMode
                      ? <Tv size={17} strokeWidth={1.8} aria-hidden="true" />
                      : <Youtube size={17} strokeWidth={1.8} aria-hidden="true" />}
                    <span>{isYouTubeMode ? 'Anime' : 'YouTube'}</span>
                    <ChevronRight size={13} className="kc-menu-chevron" aria-hidden="true" />
                  </NavLink>
                </div>
                {!isYouTubeMode && <>
                  <div className="kc-menu-section-label">Navigate</div>
                  <div className="kc-menu-grid">
                    {menuItems.slice(4).map((item) => <MenuLink key={item.label} {...item} onNavigate={closeMenu} />)}
                    <button type="button" className="kc-menu-tile kc-menu-disabled" disabled title="Schedule is not available yet">
                      <CalendarDays size={17} strokeWidth={1.8} aria-hidden="true" /><span>Schedule</span><small>Soon</small>
                    </button>
                  </div>
                  <button type="button" className="kc-menu-announcement" disabled title="Announcements are coming soon">
                    <Bell size={15} aria-hidden="true" /><span>Announcements</span><small>Soon</small>
                  </button>
                </>}
                <div className="kc-menu-footer">
                  <Link to="/settings" onClick={closeMenu}><Settings size={15} aria-hidden="true" />Settings</Link>
                  {currentUser ? <button type="button" onClick={() => void logout()} disabled={authBusy}><LogIn size={15} aria-hidden="true" />{authBusy ? 'Signing out…' : 'Sign out'}</button> : <Link to="/login" onClick={closeMenu}><LogIn size={15} aria-hidden="true" />Login</Link>}
                </div>
              </section>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="kc-main" tabIndex={-1}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/verify-email" element={<AuthPage mode="register" />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/youtube" element={<YouTubeFeedPage />} />
          <Route path="/youtube/search" element={<YouTubeSearchPage />} />
          <Route path="/youtube/channels" element={<YouTubeChannelsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/browse" element={<Navigate to="/browse/anime" replace />} />
          <Route path="/browse/:category" element={<BrowsePage />} />
          <Route path="/anime/:slug" element={<AnimePage />} />
          <Route path="/watch/:slug/:episodeNumber" element={<WatchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/library" element={<AccountPage title="My Library" />} />
          <Route path="/favorites" element={<AccountPage title="Favorites" />} />
          <Route path="/settings" element={<AccountPage title="Settings" />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <nav className="kc-mobile-nav" aria-label="Primary navigation">
        {activeMobileItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={label} to={to} end={end}>
            <Icon size={19} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
