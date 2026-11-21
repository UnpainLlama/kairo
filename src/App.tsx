import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import {
  Bell, Bookmark, CalendarDays, ChevronRight, Compass, Film, Flame, History, ListVideo,
  Home, LogIn, Menu, PlayCircle, Search, Settings, Tv, UserRound, Play, Clock, Heart, Info,
  type LucideIcon,
} from 'lucide-react';
import SearchBar from './components/SearchBar';
import HomePage from './pages/HomePage';
import YouTubeFeedPage from './pages/YouTubeFeedPage';
import MoviesHomePage from './pages/MoviesHomePage';
import MoviesBrowsePage from './pages/MoviesBrowsePage';
import MoviesSearchPage from './pages/MoviesSearchPage';
import MoviesLibraryPage from './pages/MoviesLibraryPage';
import MoviesDetailPage from './pages/MoviesDetailPage';
import MoviesWatchPage from './pages/MoviesWatchPage';
import YouTubeSearchPage from './pages/YouTubeSearchPage';
import YouTubeChannelsPage from './pages/YouTubeChannelsPage';
import YouTubeWatchPage from './pages/YouTubeWatchPage';
import { YouTubeHistoryPage, YouTubeWatchLaterPage } from './pages/YouTubeLibraryPages';
import SearchPage from './pages/SearchPage';
import BrowsePage from './pages/BrowsePage';
import AnimePage from './pages/AnimePage';
import WatchPage from './pages/WatchPage';
import AuthPage from './pages/AuthPage';
import AdminPage from './pages/AdminPage';
import { useKairoAccount } from './lib/AccountProvider';
import { clearAccountScopedBrowserData } from './lib/accountScopedStorage';
import { resolvePageTitle } from './lib/pageMetadata';
import { getWorkspaceSwitches } from './lib/workspaceNavigation';
import { logoutKairoSession } from './lib/authClient';
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
  { to: '/browse/latest', label: 'Latest', icon: Clock },
  { to: '/browse/anime', label: 'Anime', icon: Tv },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/browse/seasonal', label: 'Seasonal', icon: CalendarDays },
  { to: '/history', label: 'History', icon: History },
];

const youtubeNavItems: NavItem[] = [
  { to: '/youtube', label: 'Home', icon: PlayCircle, end: true },
  { to: '/youtube/search', label: 'Search', icon: Search },
  { to: '/youtube/channels', label: 'Channels', icon: ListVideo },
  { to: '/youtube/watch-later', label: 'Watch Later', icon: Bookmark },
  { to: '/youtube/history', label: 'History', icon: History },
];

const moviesNavItems: NavItem[] = [
  { to: '/movies', label: 'Home', icon: Film, end: true },
  { to: '/movies/browse/trending', label: 'Trending', icon: Flame },
  { to: '/movies/browse/popular', label: 'Discover', icon: Compass },
  { to: '/movies/search', label: 'Search', icon: Search },
  { to: '/movies/library', label: 'My list', icon: Bookmark },
];

function AdminOnly({ children }: { children: ReactNode }) {
  const account = useKairoAccount();
  if (account.status === 'loading') return null;
  if (account.status === 'unavailable') return <main style={{ padding: 32 }}>Access could not be verified. Please refresh and try again.</main>;
  if (account.status !== 'signed-in') return <Navigate to="/login?continue=admin" replace />;
  if (account.role !== 'admin') return <NotFoundPage />;
  return <>{children}</>;
}

function YouTubeWatchRedirect() {
  const { search } = useLocation();
  const videoId = new URLSearchParams(search).get('v') ?? '';
  const destination = /^[A-Za-z0-9_-]{11}$/.test(videoId)
    ? '/youtube/watch/' + videoId
    : '/youtube/search';
  return <Navigate to={destination} replace />;
}

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
  const location = useLocation();
  const navigationType = useNavigationType();
  const { pathname } = location;
  const account = useKairoAccount();
  const isAdmin = account.status === 'signed-in' && account.role === 'admin';
  const [adminPath, setAdminPath] = useState<string | null>(null);
  const [lastSectionMode, setLastSectionMode] = useState<'anime' | 'movies' | 'youtube'>(() => {
    try {
      const saved = window.sessionStorage.getItem('kairo:last-section');
      return saved === 'movies' || saved === 'youtube' ? saved : 'anime';
    } catch { return 'anime'; }
  });
  const sharedChromePath = ['/history', '/profile', '/library', '/favorites', '/settings', '/about', '/search', '/login'].includes(pathname);
  const isYouTubeMode = isAdmin && (pathname.startsWith('/youtube') || (sharedChromePath && lastSectionMode === 'youtube'));
  const isMoviesMode = pathname === '/movies' || pathname.startsWith('/movies/') || (sharedChromePath && lastSectionMode === 'movies');
  const isMoviesWatchMode = pathname.startsWith('/movies/') && pathname.endsWith('/watch');
  const workspaceMode = isYouTubeMode ? 'youtube' : isMoviesMode ? 'movies' : 'anime';
  const workspaceIcons: Record<'Anime' | 'Movies' | 'YouTube', LucideIcon> = { Anime: Tv, Movies: Film, YouTube: Play };
  const workspaceNavItems: NavItem[] = getWorkspaceSwitches(workspaceMode, isAdmin)
    .map(item => ({ ...item, icon: workspaceIcons[item.label], end: true }));
  const sectionNavItems = isYouTubeMode ? youtubeNavItems : isMoviesMode ? moviesNavItems : navItems;
  const activeNavItems = [...sectionNavItems, ...workspaceNavItems];
  const activeMenuItems = isYouTubeMode ? youtubeNavItems : isMoviesMode ? moviesNavItems : menuItems;
  const activeMobileItems = activeNavItems;
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const currentUser = account.status === 'signed-in' ? { displayName: account.displayName ?? 'Account', email: account.email, username: account.username } : null;
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const previousLocation = useRef({ key: location.key, pathname });
  const scrollPositions = useRef(new Map<string, number>());

  useEffect(() => {
    let mode: 'anime' | 'movies' | 'youtube' | null = null;
    if (pathname === '/' || pathname.startsWith('/browse/') || pathname.startsWith('/anime/') || pathname.startsWith('/watch/')) mode = 'anime';
    else if (pathname === '/movies' || pathname.startsWith('/movies/')) mode = 'movies';
    else if (pathname.startsWith('/youtube')) mode = 'youtube';
    if (!mode) return;
    setLastSectionMode(mode);
    try { window.sessionStorage.setItem('kairo:last-section', mode); } catch { /* Session storage is optional. */ }
  }, [pathname]);

  useEffect(() => {
    const previous = previousLocation.current;
    if (previous.key !== location.key) {
      scrollPositions.current.set(previous.key, window.scrollY);
    }
    if (previous.pathname !== pathname) {
      const savedPosition = scrollPositions.current.get(location.key);
      if (navigationType === 'POP') window.scrollTo({ top: savedPosition ?? 0, left: 0, behavior: 'auto' });
      else window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.getElementById('main')?.focus();
    }
    previousLocation.current = { key: location.key, pathname };
  }, [location.key, navigationType, pathname]);

  useEffect(() => {
    let active = true;
    if (!isAdmin) {
      setAdminPath(null);
      return () => { active = false; };
    }
    const refreshPath = () => {
      fetch('/api/v1/admin/console-path', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
        .then(response => {
          if (response.status === 401 || response.status === 404) {
            window.dispatchEvent(new Event('kairo:auth-change'));
            return null;
          }
          return response.ok ? response.json() : null;
        })
        .then(payload => {
          const nextPath = payload?.data?.path;
          if (!active || typeof nextPath !== 'string' || !/^\/[A-Za-z0-9_-]{32,128}$/.test(nextPath)) return;
          if (adminPath && pathname === adminPath && adminPath !== nextPath) navigate(nextPath, { replace: true });
          setAdminPath(nextPath);
        })
        .catch(() => { /* Keep the last known path through transient network errors. */ });
    };
    refreshPath();
    const isOnConsolePath = Boolean(adminPath && pathname === adminPath);
    if (isOnConsolePath) window.addEventListener('focus', refreshPath);
    const interval = isOnConsolePath ? window.setInterval(refreshPath, 60_000) : null;
    return () => {
      active = false;
      if (isOnConsolePath) window.removeEventListener('focus', refreshPath);
      if (interval !== null) window.clearInterval(interval);
    };
  }, [isAdmin, pathname, adminPath, navigate]);

  useEffect(() => {
    document.title = `${resolvePageTitle(pathname, lastSectionMode, adminPath)} | Kairo`;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    description?.setAttribute('content', 'Kairo — discover anime, movies and videos, and keep your personal watch history and library in one place.');
  }, [adminPath, lastSectionMode, pathname]);

  const logout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError('');
    try {
      // Revoke the internal session first so it cannot be reused after Access
      // login, while clearing account-scoped browser data only after success.
      await logoutKairoSession();
      clearAccountScopedBrowserData(account.accountId);
      window.location.assign('/cdn-cgi/access/logout');
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Could not sign out. Please try again.');
      setLogoutPending(false);
    }
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

  if (account.status === 'setup-required' && pathname !== '/login') {
    return <Navigate to="/login?setup=admin" replace />;
  }
  if (account.status === 'reauth-required' && pathname !== '/login') {
    return <Navigate to={`/login?reauth=required&continue=${encodeURIComponent(pathname + location.search)}`} replace />;
  }

  if (pathname === '/admin') return <AdminOnly><AdminPage /></AdminOnly>;
  if (adminPath && pathname === adminPath) return <AdminOnly><AdminPage /></AdminOnly>;
  if (account.status === 'limit-reached') {
    return (
      <main className="kc-access-denied" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', padding: 32, textAlign: 'center' }}>
        <h1>Kairo accounts are full</h1>
        <p>All 15 standard-account places are currently allocated. Contact the Kairo administrator if you need access.</p>
        <a href="/cdn-cgi/access/logout">Sign out of Cloudflare Access</a>
      </main>
    );
  }
  if (account.status === 'denied') {
    return (
      <main className="kc-access-denied" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', padding: 32, textAlign: 'center' }}>
        <h1>Access not authorized</h1>
        <p>This Kairo identity is not active. Only email addresses approved in the Kairo Cloudflare Access application can enter.</p>
        <p>Check that you used the email address you were invited with.</p>
        <a href="/cdn-cgi/access/logout">Sign out of Cloudflare Access</a>
      </main>
    );
  }

  return (
    <div className={`kc-app${pathname === '/' ? ' kc-home-view' : ''}${isYouTubeMode ? ' yt-app' : ''}${isMoviesMode ? ' mv-app' : ''}${isMoviesWatchMode ? ' mv-watch-app' : ''}`}>
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
          <SearchBar mode={isYouTubeMode ? 'youtube' : isMoviesMode ? 'movies' : 'anime'} />
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
                  <span><b>{currentUser?.displayName ?? 'Profile'}</b><small>{currentUser?.username ? '@' + currentUser.username : currentUser?.email ?? 'Guest account'}</small></span>
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
                <div className="kc-menu-section-label">{isYouTubeMode ? 'Video' : isMoviesMode ? 'Movies' : 'Media'}</div>
                <div className="kc-menu-grid">
                  {activeMenuItems.slice(0, isYouTubeMode || isMoviesMode ? 5 : 4).map((item) => <MenuLink key={item.label} {...item} onNavigate={closeMenu} />)}
                  {isMoviesMode ? (
                    <>
                      <MenuLink to="/browse/anime" label="Anime" icon={Tv} onNavigate={closeMenu} />
                      {isAdmin && <MenuLink to="/youtube" label="YouTube" icon={Play} onNavigate={closeMenu} />}
                    </>
                  ) : (
                    <>
                      {isAdmin && <NavLink to={isYouTubeMode ? '/' : '/youtube'} className={({ isActive }) => `kc-menu-tile${isActive ? ' active' : ''}`} onClick={closeMenu}>
                        {isYouTubeMode
                          ? <Tv size={17} strokeWidth={1.8} aria-hidden="true" />
                          : <Play size={17} strokeWidth={1.8} aria-hidden="true" />}
                        <span>{isYouTubeMode ? 'Anime' : 'YouTube'}</span>
                        <ChevronRight size={13} className="kc-menu-chevron" aria-hidden="true" />
                      </NavLink>}
                      {isAdmin && isYouTubeMode && <MenuLink to="/movies" label="Movies" icon={Film} onNavigate={closeMenu} />}
                      {isAdmin && <MenuLink to="/admin" label="Admin console" icon={Settings} onNavigate={closeMenu} />}
                    </>
                  )}
                </div>
                {!isYouTubeMode && !isMoviesMode && <>
                  <div className="kc-menu-section-label">Navigate</div>
                  <div className="kc-menu-grid">
                    {menuItems.slice(4).map((item) => <MenuLink key={item.label} {...item} onNavigate={closeMenu} />)}
                    {currentUser && <MenuLink to="/library" label="My Library" icon={Bookmark} onNavigate={closeMenu} />}
                    {currentUser && <MenuLink to="/favorites" label="Favorites" icon={Heart} onNavigate={closeMenu} />}
                    <MenuLink to="/about" label="About Kairo" icon={Info} onNavigate={closeMenu} />
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
                  {logoutError && <p className="kc-auth-error" role="alert">{logoutError}</p>}
                  {currentUser ? <button type="button" onClick={logout} disabled={logoutPending}><LogIn size={15} aria-hidden="true" />{logoutPending ? 'Signing out…' : 'Sign out of Access'}</button> : <Link to="/login" onClick={closeMenu}><LogIn size={15} aria-hidden="true" />Access help</Link>}
                </div>
              </section>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="kc-main" tabIndex={-1}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/youtube" element={<AdminOnly><YouTubeFeedPage /></AdminOnly>} />
          <Route path="/movies" element={<MoviesHomePage />} />
          <Route path="/movies/search" element={<MoviesSearchPage />} />
          <Route path="/movies/library" element={<MoviesLibraryPage />} />
          <Route path="/movies/browse/:category" element={<MoviesBrowsePage />} />
          <Route path="/movies/:externalId/watch" element={<MoviesWatchPage />} />
          <Route path="/movies/:externalId" element={<MoviesDetailPage />} />
          <Route path="/youtube/search" element={<AdminOnly><YouTubeSearchPage /></AdminOnly>} />
          <Route path="/youtube/channels" element={<AdminOnly><YouTubeChannelsPage /></AdminOnly>} />
          <Route path="/youtube/watch" element={<AdminOnly><YouTubeWatchRedirect /></AdminOnly>} />
          <Route path="/watch" element={<AdminOnly><YouTubeWatchRedirect /></AdminOnly>} />
          <Route path="/youtube/watch/:videoId" element={<AdminOnly><YouTubeWatchPage /></AdminOnly>} />
          <Route path="/youtube/watch-later" element={<AdminOnly><YouTubeWatchLaterPage /></AdminOnly>} />
          <Route path="/youtube/history" element={<AdminOnly><YouTubeHistoryPage /></AdminOnly>} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/browse/movies" element={<Navigate to="/movies" replace />} />
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
