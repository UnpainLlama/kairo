import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Aperture, ArrowDownRight, ArrowRight, Bookmark, Check, ChevronDown,
  Compass, Heart, History, Home, Library, Menu, Moon, Play, Search, Sparkles,
  Star, Tv, WandSparkles, X,
} from 'lucide-react';
import { demoCatalog } from './data/catalog';
import type { AnimeItem, ThemeName } from './types';
import { apiGet } from './lib/api';

const themes: { id: ThemeName; label: string; swatches: string[] }[] = [
  { id: 'astral-plum', label: 'Astral Plum', swatches: ['#090B16', '#9278FF', '#62D8C8'] },
  { id: 'sakura-ember', label: 'Sakura Ember', swatches: ['#100B14', '#F0789A', '#FFB36F'] },
  { id: 'ocean-circuit', label: 'Ocean Circuit', swatches: ['#06131B', '#36B8CB', '#8C8BFF'] },
  { id: 'moonlit-jade', label: 'Moonlit Jade', swatches: ['#07130F', '#60CDA5', '#A9A0FF'] },
];

function Poster({ item, large = false }: { item: AnimeItem; large?: boolean }) {
  return (
    <div className={`poster-art ${item.palette} ${large ? 'poster-art-large' : ''}`} aria-label={`${item.title} artwork placeholder`}>
      <span className="poster-orbit" />
      <span className="poster-mark">{item.posterMark}</span>
      <span className="poster-vertical">KAIRO ORIGINALS · STORY COLLECTION</span>
      <span className="poster-bottom">{item.year} / {item.format.toUpperCase()}</span>
    </div>
  );
}

function AnimeCard({ item, saved, onSave }: { item: AnimeItem; saved: boolean; onSave: (id: string) => void }) {
  return (
    <article className="anime-card">
      <Link to={`/anime/${item.slug}`} className="poster-link" aria-label={`Open ${item.title}`}>
        <Poster item={item} />
        <span className="poster-hover"><Play size={17} fill="currentColor" /> Explore title</span>
      </Link>
      <div className="card-meta">
        <div className="card-title-line"><Link to={`/anime/${item.slug}`} className="card-title">{item.title}</Link>
          <button className={`icon-button save-button ${saved ? 'is-saved' : ''}`} onClick={() => onSave(item.id)} aria-label={saved ? `Remove ${item.title} from saved` : `Save ${item.title}`}>
            {saved ? <Check size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
        <div className="card-subline"><span>{item.year}</span><i /> <span>{item.format}</span><i /> <span><Star size={12} fill="currentColor" /> {item.rating}</span></div>
      </div>
    </article>
  );
}

function Section({ title, eyebrow, items, saved, onSave, action = 'View all' }: {
  title: string; eyebrow?: string; items: AnimeItem[]; saved: string[]; onSave: (id: string) => void; action?: string;
}) {
  return (
    <section className="content-section">
      <div className="section-heading">
        <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <button className="text-action">{action}<ArrowRight size={15} /></button>
      </div>
      <div className="poster-rail">{items.map((item) => <AnimeCard key={item.id} item={item} saved={saved.includes(item.id)} onSave={onSave} />)}</div>
    </section>
  );
}

export default function App() {
  const location = useLocation();
  const [theme, setTheme] = useState<ThemeName>(() => (localStorage.getItem('kairo-theme') as ThemeName) || 'astral-plum');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<string[]>(() => JSON.parse(localStorage.getItem('kairo-saved') || '[]') as string[]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [catalog, setCatalog] = useState<AnimeItem[]>(demoCatalog);
  const [apiMode, setApiMode] = useState<'demo' | 'live'>('demo');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kairo-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('kairo-saved', JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ items: Record<string, unknown>[] }>('/catalog/featured', controller.signal)
      .then((result) => {
        if (result.items?.length) {
          const normalized = result.items.map((row, index) => ({
            id: String(row.id ?? `live-${index}`), slug: String(row.slug ?? row.id ?? index),
            title: String(row.title ?? 'Untitled'), subtitle: String(row.synopsis ?? ''),
            year: Number(row.releaseYear ?? new Date().getFullYear()), format: String(row.format ?? 'Series'),
            episodes: row.episodeCount ? `${row.episodeCount} eps` : 'Episodes TBA', rating: row.rating ? String(row.rating) : '—',
            genres: Array.isArray(row.genres) ? row.genres.map(String) : [], palette: demoCatalog[index % demoCatalog.length].palette,
            posterMark: String(row.title ?? 'KAIRO').slice(0, 10).toUpperCase(), featured: index === 0,
          } as AnimeItem));
          setCatalog(normalized.concat(demoCatalog.filter((entry) => !normalized.some((live) => live.id === entry.id))));
          setApiMode('live');
        }
      })
      .catch(() => setApiMode('demo'));
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return catalog.filter((item) => `${item.title} ${item.genres.join(' ')}`.toLowerCase().includes(value)).slice(0, 5);
  }, [catalog, query]);

  const feature = catalog.find((item) => item.featured) ?? catalog[0];
  const toggleSave = (id: string) => setSaved((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const currentPage = location.pathname === '/' ? 'Discover' : location.pathname.replace('/', '').replace('-', ' ');

  return (
    <div className="app-shell">
      <aside className={`side-rail ${menuOpen ? 'mobile-open' : ''}`}>
        <Link to="/" className="brand-lockup" aria-label="KAIRO home"><span className="brand-mark"><Aperture size={21} /></span><span>KAIRO</span></Link>
        <div className="rail-label">YOUR UNIVERSE</div>
        <nav className="rail-nav" aria-label="Main navigation">
          <Link className={`rail-link ${location.pathname === '/' ? 'active' : ''}`} to="/"><Compass size={19} /><span>Discover</span></Link>
          <Link className="rail-link" to="/browse/anime"><Tv size={19} /><span>Anime</span></Link>
          <Link className="rail-link" to="/browse/movies"><Play size={19} /><span>Movies</span></Link>
          <Link className="rail-link" to="/browse/seasonal"><Sparkles size={19} /><span>Seasonal</span></Link>
        </nav>
        <div className="rail-separator" />
        <div className="rail-label">YOUR COLLECTION</div>
        <nav className="rail-nav" aria-label="Library navigation">
          <Link className="rail-link" to="/library"><Library size={19} /><span>My Library</span><span className="nav-count">{saved.length}</span></Link>
          <Link className="rail-link" to="/history"><History size={19} /><span>History</span></Link>
          <Link className="rail-link" to="/favorites"><Heart size={19} /><span>Favorites</span></Link>
        </nav>
        <div className="rail-spacer" />
        <div className="rail-note"><span className="note-orbit"><WandSparkles size={17} /></span><p>Your next favorite story is closer than you think.</p><button onClick={() => setSearchOpen(true)}>Explore <ArrowDownRight size={14} /></button></div>
        <button className="rail-profile"><span className="avatar">K</span><span><b>Guest traveler</b><small>Personal space</small></span><ChevronDown size={15} /></button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
          <div className="breadcrumb"><span>Universe</span><ArrowRight size={13} /><b>{currentPage}</b></div>
          <div className="top-actions">
            <button className={`search-trigger ${searchOpen ? 'searching' : ''}`} onClick={() => setSearchOpen((v) => !v)}><Search size={17} /><span>Search stories, genres...</span><kbd>⌘ K</kbd></button>
            <div className="theme-control">
              <button className="icon-button" aria-label="Choose color theme" onClick={() => setTheme(themes[(themes.findIndex((t) => t.id === theme) + 1) % themes.length].id)}><Moon size={18} /></button>
              <div className="theme-tooltip">{themes.find((t) => t.id === theme)?.label}</div>
            </div>
            <button className="avatar top-avatar" aria-label="Open profile">K</button>
          </div>
        </header>

        {searchOpen && <div className="search-panel">
          <div className="search-panel-input"><Search size={20} /><input autoFocus placeholder="Find your next story..." value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && setSearchOpen(false)} /><button className="icon-button" onClick={() => { setQuery(''); setSearchOpen(false); }} aria-label="Close search"><X size={18} /></button></div>
          {query.trim() ? <div className="search-results">{filtered.length ? filtered.map((item) => <Link key={item.id} to={`/anime/${item.slug}`} onClick={() => setSearchOpen(false)}><span className="mini-poster"><Poster item={item} /></span><span><b>{item.title}</b><small>{item.year} · {item.format} · {item.genres.join(' / ')}</small></span><ArrowRight size={16} /></Link>) : <p className="muted-state">No matches in the current catalogue.</p>}</div> : <div className="search-hints"><span>TRY EXPLORING</span>{['Fantasy', 'Sci-Fi', 'Coming of age', 'Mystery'].map((word) => <button key={word} onClick={() => setQuery(word)}>{word}</button>)}</div>}
        </div>}

        <div className="page-content">
          <div className="hero-stage">
            <div className="hero-aura aura-one" /><div className="hero-aura aura-two" />
            <div className="hero-copy">
              <div className="hero-eyebrow"><span className="eyebrow-dot" /> THE STORY SPOTLIGHT <span className="eyebrow-line" /></div>
              <div className="hero-season">FEATURED UNIVERSE <span>✦</span> VOL. 01</div>
              <h1>{feature.title}<span className="hero-period">.</span></h1>
              <p className="hero-description">{feature.subtitle || 'Every world holds a story. Every story leaves a little light behind.'}</p>
              <div className="hero-tags">{feature.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}<span>{feature.year}</span><span>{feature.episodes}</span></div>
              <div className="hero-actions"><Link to={`/anime/${feature.slug}`} className="button-primary"><Play size={16} fill="currentColor" /> Explore story</Link><button className="button-secondary" onClick={() => toggleSave(feature.id)}>{saved.includes(feature.id) ? <Check size={17} /> : <Bookmark size={17} />}{saved.includes(feature.id) ? 'In your library' : 'Add to library'}</button></div>
              <div className="hero-footnote"><span className="footnote-star"><Star size={13} fill="currentColor" /></span> A handpicked world for your next watch</div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-art-ring ring-one" /><div className="hero-art-ring ring-two" /><div className="hero-art-sun" />
              <div className="character-placeholder"><span className="character-halo" /><div className="character-head" /><div className="character-hair hair-left" /><div className="character-hair hair-right" /><div className="character-body" /><div className="character-cloak" /><div className="character-light" /></div>
              <div className="hero-vertical-label">A NEW WORLD IS WAITING</div>
              <div className="hero-number">01<span> / 04</span></div>
            </div>
            <div className="hero-pagination"><span className="page-dot active" /><span className="page-dot" /><span className="page-dot" /><span className="page-dot" /></div>
          </div>

          <div className="welcome-row"><div><span className="eyebrow">CURATED FOR CURIOUS MINDS</span><h2>Find a world <em>worth staying in.</em></h2></div><div className="welcome-meta"><span className="live-dot" /> {apiMode === 'live' ? 'Connected catalogue' : 'Preview collection'} <span className="meta-divider" /> <span>Made for story lovers</span></div></div>

          <Section eyebrow="PICK UP WHERE YOU LEFT OFF" title="Continue your journey" items={catalog.slice(1, 5)} saved={saved} onSave={toggleSave} action="See history" />
          <Section eyebrow="THE COMMUNITY IS WATCHING" title="Trending across worlds" items={catalog.slice(0, 6)} saved={saved} onSave={toggleSave} />
          <div className="theme-showcase">
            <div><span className="eyebrow">MAKE IT YOURS</span><h2>A mood for <em>every universe.</em></h2><p>Four atmospheres. One place to discover your next story.</p></div>
            <div className="theme-swatches">{themes.map((item) => <button className={`theme-swatch ${theme === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setTheme(item.id)} aria-pressed={theme === item.id}>
              <span className="swatch-colors">{item.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span><span>{item.label}</span>{theme === item.id && <Check size={15} />}
            </button>)}</div>
          </div>
          <Section eyebrow="A LITTLE OFF THE MAIN PATH" title="Hidden gems to discover" items={[...catalog].reverse().slice(0, 5)} saved={saved} onSave={toggleSave} />
          <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><Aperture size={18} /></span> KAIRO</div><span>Stories move us. Worlds bring us together.</span><div className="footer-links"><a href="#about">About</a><a href="#privacy">Privacy</a><a href="#help">Help</a></div></footer>
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation"><Link to="/"><Home size={19} /><span>Home</span></Link><Link to="/browse"><Compass size={19} /><span>Browse</span></Link><button onClick={() => setSearchOpen(true)}><Search size={19} /><span>Search</span></button><Link to="/library"><Library size={19} /><span>Library</span></Link></nav>
    </div>
  );
}
