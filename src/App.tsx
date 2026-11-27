import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Bookmark, CalendarDays, ChevronRight, Clapperboard, Compass, Flame, History, ListVideo,
  Home, LogIn, LogOut, Menu, PlayCircle, Search, Settings, Tv, UserRound, X, Youtube,
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
import { useKairoAccount } from './lib/AccountProvider';
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

const youtubeNavItems: NavItem[] = [
  { to: '/youtube', label: 'Home', icon: PlayCircle, end: true },
  { to: '/youtube/search', label: 'Search', icon: Search },
  { to: '/youtube/channels', label: 'Channels', icon: ListVideo },
  { to: '/youtube/watch-later', label: 'Watch Later', icon: Bookmark },
  { to: '/youtube/history', label: 'History', icon: History },
];

const moviesNavItems: NavItem[] = [
  { to: '/movies', label: 'Home', icon: Clapperboard, end: true },
  { to: '/movies/browse/trending', label: 'Trending', icon: Flame },
  { to: '/movies/browse/popular', label: 'Discover', icon: Compass },
  { to: '/movies/search', label: 'Search', icon: Search },
  { to: '/movies/library', label: 'My list', icon: Bookmark },
];

const mobileNavItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/browse/anime', label: 'Discover', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/history', label: 'History', icon: History },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

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

export default function App() {
  const { pathname, search } = useLocation();
  const isYouTubeMode = pathname.startsWith('/youtube');
  const isMoviesMode = pathname === '/movies' || pathname.startsWith('/movies/');
  const isMoviesWatchMode = pathname.startsWith('/movies/') && pathname.endsWith('/watch');
  const activeNavItems = isYouTubeMode ? youtubeNavItems : isMoviesMode ? moviesNavItems : navItems;
  const activeMobileItems = isYouTubeMode ? youtubeNavItems : isMoviesMode ? moviesNavItems : mobileNavItems;
  const [menuOpen, setMenuOpen] = useState(false);
  const account = useKairoAccount();
  const currentUser = account.status === 'signed-in' ? { displayName: account.displayName ?? 'Account', email: account.email } : null;
  const [authBusy, setAuthBusy] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const orbLinksRef = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, search]);

  const logout = async () => {
    setAuthBusy(true);
    try { const response=await fetch('/api/v1/auth/logout',{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}}); const payload=await response.json().catch(()=>null); if(!response.ok||!payload?.success) throw new Error(payload?.error?.message??'Could not sign out.'); window.dispatchEvent(new Event('kairo:auth-change')); setMenuOpen(false); navigate('/login'); }
    catch(error) { window.alert(error instanceof Error?error.message:'Could not sign out.'); } finally { setAuthBusy(false); }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const focusedIndex = orbLinksRef.current.indexOf(document.activeElement as HTMLAnchorElement);
      const count = orbLinksRef.current.length;
      if (!count) return;
      event.preventDefault();
      const nextIndex = focusedIndex < 0
        ? (event.key === 'ArrowDown' ? 0 : count - 1)
        : (focusedIndex + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
      orbLinksRef.current[nextIndex]?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

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
          <div className={`kc-menu-wrap${menuOpen ? ' open' : ''}`} ref={menuRef}>
            <button
              ref={menuTriggerRef}
              type="button"
              className={`kc-menu-trigger${menuOpen ? ' active' : ''}`}
              aria-label={menuOpen ? 'Close section switcher' : 'Open section switcher'}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls="kc-navigation-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={21} strokeWidth={1.8} aria-hidden="true" /> : <Menu size={21} strokeWidth={1.8} aria-hidden="true" />}
            </button>
            <nav
              className={`kc-orb-panel${menuOpen ? ' open' : ''}`}
              id="kc-navigation-menu"
              aria-label="Choose a Kairo section"
              aria-hidden={!menuOpen}
              inert={!menuOpen}
            >
              <div className="kc-orb-heading">
                <small>SWITCH YOUR SPACE</small>
                <strong>One Kairo. Three worlds.</strong>
              </div>
              <div className="kc-orb-options">
                <Link
                  ref={(element) => { orbLinksRef.current[0] = element; }}
                  to="/movies"
                  className={`kc-orb-option${isMoviesMode ? ' active' : ''}`}
                  aria-current={isMoviesMode ? 'page' : undefined}
                  onClick={closeMenu}
                >
                  <span className="kc-orb-number">01</span>
                  <span className="kc-orb-icon"><Clapperboard size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                  <span className="kc-orb-copy"><b>Movies</b><small>Films and collections</small></span>
                  <ChevronRight size={17} className="kc-orb-arrow" aria-hidden="true" />
                </Link>
                <Link
                  ref={(element) => { orbLinksRef.current[1] = element; }}
                  to="/"
                  className={`kc-orb-option${!isMoviesMode && !isYouTubeMode ? ' active' : ''}`}
                  aria-current={!isMoviesMode && !isYouTubeMode ? 'page' : undefined}
                  onClick={closeMenu}
                >
                  <span className="kc-orb-number">02</span>
                  <span className="kc-orb-icon"><Tv size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                  <span className="kc-orb-copy"><b>Anime</b><small>Series and discovery</small></span>
                  <ChevronRight size={17} className="kc-orb-arrow" aria-hidden="true" />
                </Link>
                <Link
                  ref={(element) => { orbLinksRef.current[2] = element; }}
                  to="/youtube"
                  className={`kc-orb-option${isYouTubeMode ? ' active' : ''}`}
                  aria-current={isYouTubeMode ? 'page' : undefined}
                  onClick={closeMenu}
                >
                  <span className="kc-orb-number">03</span>
                  <span className="kc-orb-icon"><Youtube size={20} strokeWidth={1.8} aria-hidden="true" /></span>
                  <span className="kc-orb-copy"><b>YouTube</b><small>Videos and channels</small></span>
                  <ChevronRight size={17} className="kc-orb-arrow" aria-hidden="true" />
                </Link>
              </div>
              <div className="kc-orb-footer">
                <Link to={currentUser ? '/profile' : '/login'} onClick={closeMenu}>
                  <UserRound size={15} aria-hidden="true" /><span>{currentUser ? 'Account' : 'Log in'}</span>
                </Link>
                <Link to="/settings" onClick={closeMenu}>
                  <Settings size={15} aria-hidden="true" /><span>Settings</span>
                </Link>
                {currentUser && (
                  <button type="button" onClick={() => void logout()} disabled={authBusy}>
                    <LogOut size={15} aria-hidden="true" /><span>{authBusy ? 'Signing out…' : 'Sign out'}</span>
                  </button>
                )}
              </div>
            </nav>
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
          <Route path="/movies" element={<MoviesHomePage />} />
          <Route path="/movies/search" element={<MoviesSearchPage />} />
          <Route path="/movies/library" element={<MoviesLibraryPage />} />
          <Route path="/movies/browse/:category" element={<MoviesBrowsePage />} />
          <Route path="/movies/:externalId/watch" element={<MoviesWatchPage />} />
          <Route path="/movies/:externalId" element={<MoviesDetailPage />} />
          <Route path="/youtube/search" element={<YouTubeSearchPage />} />
          <Route path="/youtube/channels" element={<YouTubeChannelsPage />} />
          <Route path="/youtube/watch" element={<YouTubeWatchRedirect />} />
          <Route path="/watch" element={<YouTubeWatchRedirect />} />
          <Route path="/youtube/watch/:videoId" element={<YouTubeWatchPage />} />
          <Route path="/youtube/watch-later" element={<YouTubeWatchLaterPage />} />
          <Route path="/youtube/history" element={<YouTubeHistoryPage />} />
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
