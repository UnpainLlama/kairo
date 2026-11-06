import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Aperture, ArrowRight, Compass, Heart, History, Home, Library, Menu, Moon, Play, Search, Sparkles, Tv, X } from 'lucide-react';
import type { ThemeName } from './types';
import { THEMES, applyTheme, readStoredTheme } from './lib/themes';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import BrowsePage, { BrowseIndex } from './pages/BrowsePage';
import AnimePage from './pages/AnimePage';
import { AccountPage, NotFoundPage } from './pages/StaticPages';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

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

  const nextTheme = () => setTheme(THEMES[(THEMES.findIndex((t) => t.id === theme) + 1) % THEMES.length].id);
  const themeLabel = THEMES.find((t) => t.id === theme)?.label ?? '';

  return (
    <div className="app-shell">
      <a className="kc-skip" href="#main">Skip to content</a>
      <aside className={`side-rail ${menuOpen ? 'mobile-open' : ''}`}>
        <Link to="/" className="brand-lockup" aria-label="KAIRO home"><span className="brand-mark"><Aperture size={21} /></span><span>KAIRO</span></Link>
        <div className="rail-label">EXPLORE</div>
        <nav className="rail-nav" aria-label="Main navigation">
          <NavLink className="rail-link" to="/" end><Compass size={19} /><span>Discover</span></NavLink>
          <NavLink className="rail-link" to="/browse/anime"><Tv size={19} /><span>Anime</span></NavLink>
          <NavLink className="rail-link" to="/browse/movies"><Play size={19} /><span>Movies</span></NavLink>
          <NavLink className="rail-link" to="/browse/seasonal"><Sparkles size={19} /><span>Seasonal</span></NavLink>
        </nav>
        <div className="rail-separator" />
        <div className="rail-label">YOUR ACCOUNT</div>
        <nav className="rail-nav" aria-label="Account navigation">
          <NavLink className="rail-link" to="/library"><Library size={19} /><span>My Library</span></NavLink>
          <NavLink className="rail-link" to="/history"><History size={19} /><span>History</span></NavLink>
          <NavLink className="rail-link" to="/favorites"><Heart size={19} /><span>Favorites</span></NavLink>
        </nav>
        <div className="rail-spacer" />
        <div className="rail-note"><p>Find something to watch.</p><button type="button" onClick={goSearch}>Search <ArrowRight size={14} /></button></div>
        <button type="button" className="rail-profile" onClick={() => navigate('/profile')}><span className="avatar">G</span><span><b>Guest</b><small>Not signed in</small></span></button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button type="button" className="icon-button mobile-menu" onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>
          <div className="top-actions">
            <button type="button" className="search-trigger" onClick={goSearch}><Search size={17} /><span>Search titles</span><kbd>Ctrl K</kbd></button>
            <button type="button" className="icon-button" aria-label={`Colour theme: ${themeLabel}. Switch to the next theme.`} title={themeLabel} onClick={nextTheme}><Moon size={18} /></button>
            <button type="button" className="avatar top-avatar" aria-label="Open profile" onClick={() => navigate('/profile')}>G</button>
          </div>
        </header>

        <div id="main" className="page-content kc-page" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<HomePage theme={theme} onTheme={setTheme} />} />
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
          <footer className="kc-footer">KAIRO is a personal, non-commercial project. Artwork belongs to its owners and is linked from the original sources. Catalogue data attribution will be listed here once a data source is connected.</footer>
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <Link to="/"><Home size={19} /><span>Home</span></Link>
        <Link to="/browse"><Compass size={19} /><span>Browse</span></Link>
        <Link to="/search"><Search size={19} /><span>Search</span></Link>
        <Link to="/library"><Library size={19} /><span>Library</span></Link>
      </nav>
    </div>
  );
}
