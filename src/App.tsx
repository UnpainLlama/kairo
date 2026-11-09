import { useEffect } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDays, Compass, Flame, History, Home, LogIn, Search, Settings, UserRound } from 'lucide-react';
import SearchBar from './components/SearchBar';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import BrowsePage from './pages/BrowsePage';
import AnimePage from './pages/AnimePage';
import WatchPage from './pages/WatchPage';
import { AboutPage, AccountPage, HistoryPage, NotFoundPage, ProfilePage } from './pages/StaticPages';

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/browse/trending', label: 'Trending', icon: Flame },
  { to: '/browse/anime', label: 'Discover', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/browse/seasonal', label: 'Seasonal', icon: CalendarDays },
  { to: '/history', label: 'History', icon: History },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

const bottomItems: { to: string; label: string; icon: typeof Home; active?: boolean }[] = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Sign in', icon: LogIn, active: false },
];

function RailLink({ to, label, icon: Icon, end, active }: { to: string; label: string; icon: typeof Home; end?: boolean; active?: boolean }) {
  return (
    <NavLink to={to} end={end} aria-label={label} className={({ isActive }) => `kc-rail-link${(active ?? isActive) ? ' active' : ''}`}>
      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      <span className="kc-rail-tooltip" aria-hidden="true">{label}</span>
    </NavLink>
  );
}

export default function App() {
  const { pathname } = useLocation();

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="kc-app">
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

      <header className="kc-topbar"><SearchBar /></header>

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
          <Link to="/">Home</Link><Link to="/browse/trending">Trending</Link><Link to="/browse/anime">Discover</Link><Link to="/search">Search</Link><Link to="/about">About &amp; credits</Link>
        </footer>
      </main>

      <nav className="kc-mobile-nav" aria-label="Mobile navigation">
        <NavLink to="/" end><Home size={19} aria-hidden="true" /><span>Home</span></NavLink>
        <NavLink to="/browse/anime"><Compass size={19} aria-hidden="true" /><span>Discover</span></NavLink>
        <NavLink to="/search"><Search size={19} aria-hidden="true" /><span>Search</span></NavLink>
        <NavLink to="/history"><History size={19} aria-hidden="true" /><span>History</span></NavLink>
        <NavLink to="/profile"><UserRound size={19} aria-hidden="true" /><span>Profile</span></NavLink>
      </nav>
    </div>
  );
}
