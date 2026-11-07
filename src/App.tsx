import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Compass, Home, Library, Search } from 'lucide-react';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import BrowsePage, { BrowseIndex } from './pages/BrowsePage';
import AnimePage from './pages/AnimePage';
import { AccountPage, NotFoundPage } from './pages/StaticPages';

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
    <div className="app-shell">
      <a className="kc-skip" href="#main">Skip to content</a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="KAIRO home">KAIRO</Link>
        <nav className="top-nav" aria-label="Main navigation">
          <NavLink className="top-link" to="/" end>Home</NavLink>
          <NavLink className="top-link" to="/browse/anime">Anime</NavLink>
          <NavLink className="top-link" to="/browse/movies">Movies</NavLink>
          <NavLink className="top-link" to="/browse/seasonal">Seasonal</NavLink>
          <NavLink className="top-link" to="/library">Library</NavLink>
        </nav>
        <div className="top-actions">
          <button type="button" className="search-trigger" onClick={goSearch}><Search size={17} aria-hidden="true" /><span>Search titles</span><kbd>Ctrl K</kbd></button>
          <button type="button" className="avatar" aria-label="Open profile" onClick={() => navigate('/profile')}>G</button>
        </div>
      </header>

      <main id="main" className="page-content kc-page" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/browse" element={<BrowseIndex />} />
          <Route path="/browse/:category" element={<BrowsePage />} />
          <Route path="/anime/:slug" element={<AnimePage />} />
          <Route path="/library" element={<AccountPage title="My Library" />} />
          <Route path="/history" element={<AccountPage title="History" />} />
          <Route path="/favorites" element={<AccountPage title="Favorites" />} />
          <Route path="/profile" element={<AccountPage title="Profile" />} />
          <Route path="/settings" element={<AccountPage title="Settings" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <footer className="kc-footer">KAIRO is a personal, non-commercial project. Artwork belongs to its owners and is linked from the original sources. Where each title’s data comes from is listed on its page.</footer>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <NavLink to="/" end><Home size={19} aria-hidden="true" /><span>Home</span></NavLink>
        <NavLink to="/browse"><Compass size={19} aria-hidden="true" /><span>Browse</span></NavLink>
        <NavLink to="/search"><Search size={19} aria-hidden="true" /><span>Search</span></NavLink>
        <NavLink to="/library"><Library size={19} aria-hidden="true" /><span>Library</span></NavLink>
      </nav>
    </div>
  );
}
