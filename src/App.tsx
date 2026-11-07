import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Bookmark, CalendarDays, Compass, Flame, History, Home, Library,
  Search, Settings, UserRound,
} from 'lucide-react';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import BrowsePage, { BrowseIndex } from './pages/BrowsePage';
import AnimePage from './pages/AnimePage';
import WatchPage from './pages/WatchPage';
import { AccountPage, NotFoundPage } from './pages/StaticPages';

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/browse/trending', label: 'Trending', icon: Flame },
  { to: '/browse/anime', label: 'Discover', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/browse/seasonal', label: 'Seasonal', icon: CalendarDays },
  { to: '/history', label: 'History', icon: History },
  { to: '/library', label: 'My library', icon: Bookmark },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const goSearch = () => {
    if (location.pathname === '/search') document.getElementById('search-input')?.focus();
    else navigate('/search');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.location.pathname === '/search') document.getElementById('search-input')?.focus();
        else navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="app-shell kc-app-shell">
      <a className="kc-skip" href="#main">Skip to content</a>

      <aside className="kc-nav-rail" aria-label="Kairo navigation">
        <Link to="/" className="kc-nav-brand" aria-label="Kairo home"><span>K</span></Link>
        <nav className="kc-rail-links" aria-label="Main navigation">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              aria-label={label}
              className={({ isActive }) => `kc-rail-link${isActive ? ' active' : ''}`}
            >
              <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              <span className="kc-rail-tooltip">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="kc-rail-bottom">
          <NavLink to="/settings" title="Settings" aria-label="Settings" className={({ isActive }) => `kc-rail-link${isActive ? ' active' : ''}`}>
            <Settings size={20} strokeWidth={1.8} aria-hidden="true" />
            <span className="kc-rail-tooltip">Settings</span>
          </NavLink>
          <NavLink to="/profile" title="Profile" aria-label="Profile" className={({ isActive }) => `kc-rail-link${isActive ? ' active' : ''}`}>
            <UserRound size={20} strokeWidth={1.8} aria-hidden="true" />
            <span className="kc-rail-tooltip">Profile</span>
          </NavLink>
        </div>
      </aside>

      <header className="kc-topbar">
        <button type="button" className="kc-top-search" onClick={goSearch} aria-label="Search titles">
          <Search size={18} aria-hidden="true" />
          <span>Search anime...</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="kc-top-actions">
          <button type="button" className="kc-avatar" aria-label="Open profile" onClick={() => navigate('/profile')}>G</button>
        </div>
      </header>

      <main id="main" className="page-content kc-page" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/browse" element={<BrowseIndex />} />
          <Route path="/browse/:category" element={<BrowsePage />} />
          <Route path="/anime/:slug" element={<AnimePage />} />
          <Route path="/watch/:slug/:episodeNumber" element={<WatchPage />} />
          <Route path="/library" element={<AccountPage title="My Library" />} />
          <Route path="/history" element={<AccountPage title="History" />} />
          <Route path="/favorites" element={<AccountPage title="Favorites" />} />
          <Route path="/profile" element={<AccountPage title="Profile" />} />
          <Route path="/settings" element={<AccountPage title="Settings" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <footer className="kc-footer">KAIRO is a personal, non-commercial project. Artwork belongs to its owners and is linked from the original sources. Where each title’s data comes from is listed on its page.</footer>
      </main>

      <nav className="mobile-bottom-nav kc-mobile-nav" aria-label="Mobile navigation">
        <NavLink to="/" end><Home size={19} aria-hidden="true" /><span>Home</span></NavLink>
        <NavLink to="/browse/anime"><Compass size={19} aria-hidden="true" /><span>Discover</span></NavLink>
        <NavLink to="/search"><Search size={19} aria-hidden="true" /><span>Search</span></NavLink>
        <NavLink to="/library"><Library size={19} aria-hidden="true" /><span>Library</span></NavLink>
      </nav>
    </div>
  );
}
