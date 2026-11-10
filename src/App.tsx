import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  Bell, CalendarDays, ChevronRight, Compass, Film, Flame, History,
  Home, LogIn, Menu, Search, Settings, Tv, UserRound, Youtube,
  type LucideIcon,
} from 'lucide-react';
import SearchBar from './components/SearchBar';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import BrowsePage from './pages/BrowsePage';
import AnimePage from './pages/AnimePage';
import WatchPage from './pages/WatchPage';
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

const bottomItems: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Login', icon: LogIn, active: false },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

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
    <div className={`kc-app${pathname === '/' ? ' kc-home-view' : ''}`}>
      <a className="kc-skip" href="#main">Skip to content</a>

      <aside className="kc-rail" aria-label="Primary">
        <Link to="/" className="kc-brand" aria-label="Kairo home"><img src="/kairo-k.svg" alt="" width="22" height="26" /></Link>
        <nav className="kc-rail-links" aria-label="Main navigation">
          {navItems.map((item) => <RailLink key={item.label} {...item} />)}
        </nav>
        <div className="kc-rail-bottom">
          {bottomItems.map((item) => <RailLink key={item.label} {...item} />)}
        </div>
      </aside>

      <header className="kc-topbar">
        <div className="kc-topbar-inner">
          <SearchBar />
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
                <Link to="/profile" className="kc-menu-profile" onClick={closeMenu}>
                  <span className="kc-menu-avatar"><UserRound size={19} aria-hidden="true" /></span>
                  <span><b>Profile</b><small>Guest account</small></span>
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>

                <div className="kc-menu-section-label">Media</div>
                <div className="kc-menu-grid">
                  {menuItems.slice(0, 4).map((item) => <MenuLink key={item.label} {...item} onNavigate={closeMenu} />)}
                  <button type="button" className="kc-menu-tile kc-menu-disabled" disabled title="YouTube browsing is not available yet">
                    <Youtube size={17} strokeWidth={1.8} aria-hidden="true" />
                    <span>YouTube</span><small>Soon</small>
                  </button>
                </div>

                <div className="kc-menu-section-label">Navigate</div>
                <div className="kc-menu-grid">
                  {menuItems.slice(4).map((item) => <MenuLink key={item.label} {...item} onNavigate={closeMenu} />)}
                  <button type="button" className="kc-menu-tile kc-menu-disabled" disabled title="Schedule is not available yet">
                    <CalendarDays size={17} strokeWidth={1.8} aria-hidden="true" />
                    <span>Schedule</span><small>Soon</small>
                  </button>
                </div>

                <button type="button" className="kc-menu-announcement" disabled title="Announcements are coming soon">
                  <Bell size={15} aria-hidden="true" /><span>Announcements</span><small>Soon</small>
                </button>

                <div className="kc-menu-footer">
                  <Link to="/settings" onClick={closeMenu}><Settings size={15} aria-hidden="true" />Settings</Link>
                  <Link to="/profile" onClick={closeMenu}><LogIn size={15} aria-hidden="true" />Login</Link>
                </div>
              </section>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="kc-main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
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
        <footer className="kc-footer">
          <Link to="/">Home</Link><Link to="/browse/trending">Trending</Link><Link to="/browse/anime">Discover</Link><Link to="/browse/movies">Movies</Link><Link to="/search">Search</Link><Link to="/about">About &amp; credits</Link>
        </footer>
      </main>

      <nav className="kc-mobile-nav" aria-label="Primary navigation">
        <NavLink to="/" end><Home size={19} aria-hidden="true" /><span>Home</span></NavLink>
        <NavLink to="/browse/anime"><Compass size={19} aria-hidden="true" /><span>Discover</span></NavLink>
        <NavLink to="/search"><Search size={19} aria-hidden="true" /><span>Search</span></NavLink>
        <NavLink to="/history"><History size={19} aria-hidden="true" /><span>History</span></NavLink>
        <NavLink to="/profile"><UserRound size={19} aria-hidden="true" /><span>Profile</span></NavLink>
      </nav>
    </div>
  );
}
