import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, ArrowLeft, Bookmark, Check, Clapperboard, Compass, Film,
  Heart, History, Home, Library, LogOut, Menu, Search, Settings, Shield, Sparkles,
  UserRound, X,
} from 'lucide-react';
import { Link, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAccount } from '../lib/AccountProvider';
import { apiGet } from '../lib/api';
import { authRequest } from '../lib/authClient';
import { useApi, type ApiState } from '../lib/useApi';
import {
  dateLabel, durationLabel, episodeCountLabel, formatLabel, safeImageUrl, seasonLabel,
  statusLabel, textList, type AnimeDetails, type CatalogCard, type Episode, type EpisodeServer,
} from '../lib/catalog';
import {
  movieHref, movieRating, movieYear, type MovieDetail, type MoviePage, type MovieSummary,
} from '../lib/movies';
import {
  deleteMediaPlayback, loadMediaPlayback, syncMediaPlayback, writeLocalMediaPlayback, type MediaPlaybackSnapshot,
  type SavedPlayerState,
} from '../lib/mediaPlayback';
import { shouldSyncPlaybackProgress, type PlaybackSaveReason } from '../lib/playbackSync';
import KairoMediaPlayer, { type KairoPlaybackSource } from './KairoMediaPlayer';
import MovieEmbedPlayer from './MovieEmbedPlayer';

type PageData<T> = { items: T[] };
type Preferences = {
  theme: 'astral-plum' | 'sakura-ember' | 'ocean-circuit' | 'moonlit-jade';
  interfaceLanguage: 'en';
  subtitleLanguage: string;
  subtitleSize: 'small' | 'medium' | 'large';
  autoplayNext: boolean;
  defaultPlaybackSpeed: number;
  historyPaused: boolean;
};
type Profile = {
  id: string;
  username: string | null;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  bio: string;
  visibility: 'private' | 'public';
  createdAt: string;
};
type AnimeLibraryEntry = {
  animeId: string;
  slug: string;
  title: string;
  posterUrl: string | null;
  status: string;
  isFavorite: boolean | number;
  addedAt: string | number;
  updatedAt: string | number;
};
type AnimeLibraryReference = {
  providerId: 'anilist' | 'mal' | 'hianime';
  externalId: string;
  slug: string;
  status: string | null;
  isFavorite: boolean;
  addedAt: number;
  updatedAt: number;
};
type AnimeLibraryPayload = {
  items: AnimeLibraryEntry[];
  references?: AnimeLibraryReference[];
};
type MovieLibraryEntry = {
  providerId: string;
  externalId: string;
  status: 'watchlist' | 'watched' | null;
  isFavorite: boolean | number;
  rating: number | null;
  updatedAt: number;
};
type PlaybackItem = MediaPlaybackSnapshot;
type AdminAccount = {
  id: string;
  username: string | null;
  displayName: string;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: string;
  credentialsConfigured: number;
  mustChangePassword: number;
};
type ServerList = { items: EpisodeServer[] };
type SourceResult = { source: KairoPlaybackSource };

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'astral-plum', interfaceLanguage: 'en', subtitleLanguage: 'en',
  subtitleSize: 'medium', autoplayNext: true, defaultPlaybackSpeed: 1, historyPaused: false,
};

function ItemError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <section className="state-panel" role="alert">
      <div className="state-icon"><Activity size={22} /></div>
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      {onRetry && <button type="button" className="button button-secondary" onClick={onRetry}>Try again</button>}
    </section>
  );
}

function LoadingPanel({ label = 'Loading Kairo…' }: { label?: string }) {
  return <div className="loading-panel" role="status" aria-live="polite"><span className="spinner" />{label}</div>;
}

function EmptyPanel({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <section className="state-panel"><div className="state-icon"><Sparkles size={22} /></div><h2>{title}</h2><p>{message}</p>{action}</section>;
}

function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}

function PosterCard({ item, kind = 'anime' }: { item: CatalogCard | MovieSummary; kind?: 'anime' | 'movie' }) {
  const isAnime = kind === 'anime';
  const anime = item as CatalogCard;
  const movie = item as MovieSummary;
  const title = isAnime ? anime.title : movie.title;
  const image = isAnime ? anime.posterUrl : movie.posterUrl;
  const year = isAnime ? anime.releaseYear : movie.releaseYear;
  const rating = isAnime ? anime.rating : movie.voteAverage;
  const href = isAnime ? '/anime/' + encodeURIComponent(anime.slug || anime.id) : movieHref(movie);
  return (
    <article className="poster-card">
      <Link to={href} className="poster-link" aria-label={'View ' + title}>
        <div className="poster-art">
          {safeImageUrl(image) ? <img src={safeImageUrl(image) ?? undefined} alt="" loading="lazy" /> : <div className="poster-fallback"><Film size={28} /><span>KAIRO</span></div>}
          <span className="poster-type">{isAnime ? 'ANIME' : 'MOVIE'}</span>
          <span className="poster-open">View title</span>
        </div>
        <div className="poster-caption">
          <h3>{title}</h3>
          <p>{[year, rating && rating > 0 ? '★ ' + rating.toFixed(1) : null].filter(Boolean).join(' · ') || 'Details available'}</p>
        </div>
      </Link>
    </article>
  );
}

function PosterGrid({ items, kind = 'anime' }: { items: (CatalogCard | MovieSummary)[]; kind?: 'anime' | 'movie' }) {
  return <div className="poster-grid">{items.map((item) => <PosterCard key={kind === 'anime' ? (item as CatalogCard).id : (item as MovieSummary).externalId} item={item} kind={kind} />)}</div>;
}

function LoadableGrid({ state, kind = 'anime' }: { state: ApiState<PageData<CatalogCard>>; kind?: 'anime' | 'movie' }) {
  if (state.status === 'loading') return <LoadingPanel label="Loading titles…" />;
  if (state.status === 'error') return <ItemError error={state.error} />;
  if (!state.data.items.length) return <EmptyPanel title="Nothing here yet" message="No titles match this view. Try another category or come back later." />;
  return <PosterGrid items={state.data.items} kind={kind} />;
}

function AppShell() {
  const account = useAccount();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const adminPathState = useApi<{ path: string }>(account.user?.role === 'admin' ? '/admin/console-path' : null);
  const preferencesState = useApi<Preferences>('/me/preferences');

  useEffect(() => {
    const theme = preferencesState.status === 'ok' ? preferencesState.data.theme : DEFAULT_PREFERENCES.theme;
    document.documentElement.dataset.theme = theme;
  }, [preferencesState.status, preferencesState.status === 'ok' ? preferencesState.data.theme : '']);

  useEffect(() => {
    setMobileOpen(false);
    setQuery('');
  }, [location.pathname]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setMobileOpen(false);
        if (document.activeElement === searchRef.current) searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length >= 2) navigate('/search?q=' + encodeURIComponent(value));
    else navigate('/search');
    searchRef.current?.blur();
  }

  async function signOut() {
    await account.logout();
    navigate('/login', { replace: true });
  }

  const adminPath = adminPathState.status === 'ok' ? adminPathState.data.path : null;
  const nav = (
    <>
      <NavLink to="/" end><Home size={18} /><span>Discover</span></NavLink>
      <NavLink to="/anime"><Compass size={18} /><span>Anime</span></NavLink>
      <NavLink to="/movies"><Clapperboard size={18} /><span>Movies</span></NavLink>
      <NavLink to="/seasonal"><Sparkles size={18} /><span>Seasonal</span></NavLink>
      <NavLink to="/library"><Library size={18} /><span>My Library</span></NavLink>
      <NavLink to="/history"><History size={18} /><span>History</span></NavLink>
    </>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Kairo home">
          <img src="/kairo-k.svg" alt="" width="30" height="34" />
          <span>KAIRO</span>
        </Link>
        <button className="icon-button mobile-menu-button" type="button" onClick={() => setMobileOpen(v => !v)} aria-expanded={mobileOpen} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">{nav}</nav>
        <form className="global-search" role="search" onSubmit={submitSearch}>
          <Search size={17} aria-hidden="true" />
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Anime" placeholder="Search anime…" />
          <kbd>⌘ K</kbd>
        </form>
        <div className="topbar-actions">
          <NavLink to="/profile" className="profile-shortcut" aria-label="Your profile"><UserRound size={19} /><span>{account.user?.displayName ?? 'Profile'}</span></NavLink>
          {adminPath && <Link to={adminPath} className="admin-shortcut" aria-label="Administrator console"><Shield size={17} /></Link>}
          <button type="button" className="icon-button signout-button" onClick={() => { void signOut().catch(() => undefined); }} aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </header>
      {mobileOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{nav}<NavLink to="/settings"><Settings size={18} /><span>Settings</span></NavLink></nav>}
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Kairo</span>
        <span>Private library · Account-synced progress</span>
        <Link to="/settings">Settings</Link>
      </footer>
    </div>
  );
}

function DiscoverPage() {
  const featured = useApi<PageData<CatalogCard>>('/catalog/featured');
  const trending = useApi<PageData<CatalogCard>>('/catalog/trending?page=1&limit=12');
  const latest = useApi<PageData<CatalogCard>>('/catalog/latest?page=1&limit=12');
  const continueWatching = useApi<PageData<PlaybackItem>>('/me/playback?limit=20');
  const featuredTitle = featured.status === 'ok' ? featured.data.items[0] : null;
  const progress = continueWatching.status === 'ok' ? continueWatching.data.items.filter(item => item.mediaType !== 'youtube' && !item.completed && item.progressSeconds > 5) : [];
  return (
    <div className="page page-discover">
      <section className="hero-stage">
        {featuredTitle?.bannerUrl && safeImageUrl(featuredTitle.bannerUrl) && <img className="hero-background" src={safeImageUrl(featuredTitle.bannerUrl) ?? undefined} alt="" />}
        <div className="hero-shade" />
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles size={14} /> YOUR NEXT STORY STARTS HERE</p>
          <h1>{featuredTitle?.title ?? 'Find your next favourite story.'}</h1>
          <p>{featuredTitle?.synopsis || 'Explore anime, discover films, and keep your watch progress in sync across your Kairo account.'}</p>
          <div className="hero-actions">
            {featuredTitle ? <Link className="button button-primary" to={'/anime/' + encodeURIComponent(featuredTitle.slug || featuredTitle.id)}>Explore title</Link> : <Link className="button button-primary" to="/anime">Explore anime</Link>}
            <Link className="button button-glass" to="/library"><Bookmark size={16} /> My library</Link>
          </div>
          {featuredTitle && <div className="hero-meta">{[formatLabel(featuredTitle.format), seasonLabel(featuredTitle.season, featuredTitle.releaseYear), statusLabel(featuredTitle.status)].filter(Boolean).join(' · ')}</div>}
          {featured.status === 'error' && <p className="inline-note">Featured catalogue is unavailable. Other sections may still load.</p>}
        </div>
        <div className="hero-orbit" aria-hidden="true"><span /><span /><span /></div>
      </section>

      {progress.length > 0 && (
        <section className="content-section">
          <SectionHeading title="Continue watching" description="Pick up where you left off." action={<Link to="/history">View history <ArrowLeft className="arrow-right" size={15} /></Link>} />
          <div className="continue-rail">
            {progress.slice(0, 8).map(item => {
              const percent = item.durationSeconds ? Math.min(100, Math.round(item.progressSeconds / item.durationSeconds * 100)) : 0;
              const href = item.mediaType === 'movie' ? '/watch/movie/' + encodeURIComponent(item.mediaKey) : (() => {
                const parts = item.mediaKey.match(/^(.+):(\d+)$/);
                return parts ? '/watch/' + encodeURIComponent(parts[1]) + '/' + parts[2] : '/history';
              })();
              return <Link className="continue-card" to={href} key={item.mediaType + item.mediaKey}>
                <div className="continue-art">{item.artworkUrl ? <img src={item.artworkUrl} alt="" loading="lazy" /> : <Film size={22} />}<span className="progress-track"><i style={{ width: percent + '%' }} /></span></div>
                <div><strong>{item.title}</strong><small>{Math.floor(item.progressSeconds / 60)} min watched</small></div>
              </Link>;
            })}
          </div>
        </section>
      )}
      <section className="content-section">
        <SectionHeading title="Trending this week" description="Stories making waves right now." action={<Link to="/anime?sort=trending">Browse anime <ArrowLeft className="arrow-right" size={15} /></Link>} />
        <LoadableGrid state={trending} />
      </section>
      <section className="content-section">
        <SectionHeading title="Recently updated" description="Freshly surfaced catalogue picks." action={<Link to="/anime?sort=latest">View all <ArrowLeft className="arrow-right" size={15} /></Link>} />
        <LoadableGrid state={latest} />
      </section>
      <section className="content-section movie-teaser">
        <div><p className="eyebrow">A DIFFERENT KIND OF STORY</p><h2>Switch to the big screen.</h2><p>Discover films and save them alongside your Anime library.</p><Link className="button button-secondary" to="/movies">Explore movies</Link></div>
        <Film size={80} strokeWidth={1} aria-hidden="true" />
      </section>
    </div>
  );
}

function AnimeBrowsePage({ seasonal = false }: { seasonal?: boolean }) {
  const [params, setParams] = useSearchParams();
  const genre = params.get('genre') ?? '';
  const sort = params.get('sort') ?? 'popularity';
  const season = seasonal ? 'current' : params.get('season') ?? '';
  const path = '/catalog/browse?' + new URLSearchParams({
    sort, page: params.get('page') ?? '1', limit: '24',
    ...(genre ? { genre } : {}), ...(season ? { season } : {}),
  }).toString();
  const results = useApi<PageData<CatalogCard>>(path);
  const genres = useApi<PageData<string | { name: string; count?: number }>>('/catalog/genres');
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    setParams(next);
  };
  return (
    <div className="page">
      <PageHeading eyebrow={seasonal ? 'CURRENT SEASON' : 'THE ANIME CATALOGUE'} title={seasonal ? 'Seasonal picks' : 'Explore Anime'} description={seasonal ? 'Titles currently associated with this calendar season.' : 'Search by genre, browse what is trending, and find your next watch.'} />
      <div className="filter-bar">
        <label>Genre <select value={genre} onChange={event => setFilter('genre', event.target.value)}><option value="">All genres</option>{(genres.status === 'ok' ? genres.data.items.map(g => typeof g === 'string' ? g : g.name) : []).map(genreName => <option key={genreName} value={genreName}>{genreName}</option>)}</select></label>
        {!seasonal && <label>Season <select value={season} onChange={event => setFilter('season', event.target.value)}><option value="">Any season</option><option value="winter">Winter</option><option value="spring">Spring</option><option value="summer">Summer</option><option value="fall">Fall</option><option value="current">Current season</option></select></label>}
        <label>Sort <select value={sort} onChange={event => setFilter('sort', event.target.value)}><option value="popularity">Popularity</option><option value="trending">Trending</option><option value="latest">Latest</option><option value="rating">Rating</option><option value="relevance">Relevance</option></select></label>
        {(genre || (!seasonal && season) || sort !== 'popularity') && <button type="button" className="text-action" onClick={() => setParams(seasonal ? new URLSearchParams() : new URLSearchParams())}>Clear filters</button>}
      </div>
      {results.status === 'loading' && <LoadingPanel label="Finding anime…" />}
      {results.status === 'error' && <ItemError error={results.error} onRetry={results.reload} />}
      {results.status === 'ok' && (results.data.items.length ? <PosterGrid items={results.data.items} /> : <EmptyPanel title="No titles found" message="Try another genre or season." />)}
      {results.status === 'ok' && results.meta.hasNextPage && <div className="pagination"><button className="button button-secondary" onClick={() => setFilter('page', String(Number(params.get('page') ?? 1) + 1))}>Load more</button></div>}
    </div>
  );
}

function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') ?? '');
  const query = params.get('q')?.trim() ?? '';
  const path = query.length >= 2 ? '/catalog/search?' + new URLSearchParams({ q: query, page: '1', limit: '24' }).toString() : null;
  const results = useApi<PageData<CatalogCard>>(path);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (input.trim()) next.set('q', input.trim());
    setParams(next);
  }
  return (
    <div className="page">
      <PageHeading eyebrow="DISCOVERY" title="Search" description="Find Anime by title, genre, or keyword." />
      <form className="page-search" role="search" onSubmit={submit}>
        <Search size={20} /><input value={input} onChange={event => setInput(event.target.value)} autoFocus aria-label="Search catalogue" placeholder="Try a title or genre…" /><button className="button button-primary" type="submit">Search</button>
      </form>
      {query.length < 2 ? <EmptyPanel title="Start searching" message="Enter at least two characters to search the connected catalogue." /> : <LoadableGrid state={results} />}
      {results.status === 'ok' && results.meta.hasNextPage && <p className="inline-note">More results are available. Narrow your query to find a title faster.</p>}
    </div>
  );
}

function AnimeDetailPage() {
  const { id = '' } = useParams();
  const title = useApi<AnimeDetails>('/anime/' + encodeURIComponent(id));
  const episodes = useApi<PageData<Episode>>('/anime/' + encodeURIComponent(id) + '/episodes?page=1&limit=100');
  const related = useApi<PageData<CatalogCard>>('/anime/' + encodeURIComponent(id) + '/related?limit=12');
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [libraryStatus, setLibraryStatus] = useState('plan_to_watch');
  const account = useAccount();
  const [saved, setSaved] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const currentAnime = title.status === 'ok' ? title.data : null;
  const currentAnimeId = currentAnime?.id;
  const currentAnimeSlug = currentAnime?.slug;

  useEffect(() => {
    if (!currentAnimeId) { setSaved(false); setFavorite(false); return; }
    let active = true;
    void apiGet<AnimeLibraryPayload>('/me/library').then(result => {
      const found = result.items.find(entry => entry.animeId === currentAnimeId);
      const reference = result.references?.find(entry => entry.slug === currentAnimeSlug ||
        (currentAnimeId.startsWith('a') && entry.providerId === 'anilist' && entry.externalId === currentAnimeId.slice(1)) ||
        (currentAnimeId.startsWith('m') && entry.providerId === 'mal' && entry.externalId === currentAnimeId.slice(1)) ||
        (currentAnimeId.startsWith('h') && entry.providerId === 'hianime' && entry.externalId === currentAnimeId.slice(1)));
      const savedEntry = found ?? reference;
      if (active && savedEntry) {
        setSaved(true);
        setLibraryStatus(savedEntry.status ?? 'plan_to_watch');
        setFavorite(Boolean(savedEntry.isFavorite));
      } else if (active) {
        setSaved(false);
        setFavorite(false);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [currentAnimeId, currentAnimeSlug]);

  async function saveLibrary(nextFavorite = favorite) {
    if (title.status !== 'ok') return;
    setLibraryBusy(true); setLibraryMessage('');
    try {
      const libraryId = title.data.slug || title.data.id;
      await authRequest('/me/library/' + encodeURIComponent(libraryId), {
        method: 'PUT', body: JSON.stringify({ status: libraryStatus, isFavorite: nextFavorite }),
      });
      setSaved(true); setFavorite(nextFavorite); setLibraryMessage('Saved to your account library.');
    } catch (error) { setLibraryMessage(error instanceof Error ? error.message : 'Could not save this title.'); }
    finally { setLibraryBusy(false); }
  }

  if (title.status === 'loading') return <div className="page"><LoadingPanel label="Loading title…" /></div>;
  if (title.status === 'error') return <div className="page"><ItemError error={title.error} onRetry={title.reload} /></div>;
  const item = title.data;
  return (
    <div className="page detail-page">
      <Link className="back-link" to="/anime"><ArrowLeft size={16} /> Back to Anime</Link>
      <section className="detail-hero">
        {safeImageUrl(item.bannerUrl) && <img className="detail-backdrop" src={safeImageUrl(item.bannerUrl) ?? undefined} alt="" />}
        <div className="detail-gradient" />
        <div className="detail-poster">{safeImageUrl(item.posterUrl) ? <img src={safeImageUrl(item.posterUrl) ?? undefined} alt={item.title + ' poster'} /> : <div className="poster-fallback"><Film size={30} /></div>}</div>
        <div className="detail-copy">
          <p className="eyebrow">ANIME · KAIRO CATALOGUE</p>
          <h1>{item.title}</h1>
          <p className="detail-meta">{[formatLabel(item.format), seasonLabel(item.season, item.releaseYear), statusLabel(item.status), episodeCountLabel(item.episodeCount), item.rating !== null ? '★ ' + item.rating.toFixed(1) : null].filter(Boolean).join(' · ')}</p>
          <p className="detail-synopsis">{item.synopsis || 'No synopsis is available for this title yet.'}</p>
          <div className="chip-row">{textList(item.genres).map(genre => <span className="chip" key={genre}>{genre}</span>)}</div>
          <div className="detail-actions">
            {episodes.status === 'ok' && episodes.data.items[0] && <Link className="button button-primary" to={'/watch/' + encodeURIComponent(item.id) + '/' + episodes.data.items[0].episodeNumber}>Start watching</Link>}
            <select aria-label="Library status" value={libraryStatus} onChange={event => setLibraryStatus(event.target.value)}><option value="watching">Watching</option><option value="plan_to_watch">Plan to watch</option><option value="completed">Completed</option><option value="on_hold">On hold</option><option value="dropped">Dropped</option></select>
            <button className="button button-secondary" type="button" disabled={libraryBusy} onClick={() => { void saveLibrary(); }}>{saved ? <Check size={16} /> : <Bookmark size={16} />}{saved ? 'Saved' : 'Add to library'}</button>
            <button className="button button-quiet" type="button" disabled={libraryBusy} onClick={() => { void saveLibrary(!favorite); }} aria-label={favorite ? "Remove from favourites" : "Add to favourites"} aria-pressed={favorite}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button>
          </div>
          {libraryMessage && <p className="inline-note" role="status">{libraryMessage}</p>}
          <p className="detail-account-note">Signed in as @{account.user?.username}. Your library changes sync to this account.</p>
        </div>
      </section>

      <section className="content-section">
        <SectionHeading title="Episodes" description="Choose an episode to start or resume." />
        {episodes.status === 'loading' && <LoadingPanel label="Loading episodes…" />}
        {episodes.status === 'error' && <ItemError error={episodes.error} onRetry={episodes.reload} />}
        {episodes.status === 'ok' && episodes.data.items.length === 0 && <EmptyPanel title="Episodes are not available" message="The current episode provider did not return an episode list for this title." />}
        {episodes.status === 'ok' && <div className="episode-list">{episodes.data.items.map(episode => <Link className="episode-row" key={episode.id} to={'/watch/' + encodeURIComponent(item.id) + '/' + episode.episodeNumber}>
          <div className="episode-thumb">{safeImageUrl(episode.thumbnailUrl) ? <img src={safeImageUrl(episode.thumbnailUrl) ?? undefined} alt="" loading="lazy" /> : <span>{episode.episodeNumber}</span>}</div>
          <div className="episode-info"><strong>Episode {episode.episodeNumber}: {episode.title || 'Untitled episode'}</strong><p>{episode.synopsis || 'Episode details not supplied.'}</p><small>{episode.durationSeconds ? durationLabel(episode.durationSeconds) : 'Duration unavailable'}{episode.publishedAt ? ' · ' + (dateLabel(episode.publishedAt) ?? '') : ''}</small></div>
          <span className="episode-play">Play</span>
        </Link>)}</div>}
      </section>
      <section className="content-section">
        <SectionHeading title="Related titles" />
        {related.status === 'loading' && <LoadingPanel />}
        {related.status === 'error' && <ItemError error={related.error} onRetry={related.reload} />}
        {related.status === 'ok' && (related.data.items.length ? <PosterGrid items={related.data.items} /> : <EmptyPanel title="No related titles yet" message="Recommendations will appear when the provider has related titles." />)}
      </section>
    </div>
  );
}

function AnimeWatchPage() {
  const { titleId = '', episodeNumber: episodeRaw = '' } = useParams();
  const episodeNumber = Number(episodeRaw);
  const title = useApi<AnimeDetails>('/anime/' + encodeURIComponent(titleId));
  const servers = useApi<ServerList>(Number.isInteger(episodeNumber) && episodeNumber > 0 ? '/anime/' + encodeURIComponent(titleId) + '/episodes/' + episodeNumber + '/servers' : null);
  const account = useAccount();
  const preferencesState = useApi<Preferences>('/me/preferences');
  const [serverId, setServerId] = useState('');
  const [snapshot, setSnapshot] = useState<MediaPlaybackSnapshot | null>(null);
  const snapshotRef = useRef<MediaPlaybackSnapshot | null>(null);
  const lastLocalSavedAt = useRef(0);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const sourcePath = serverId ? '/anime/' + encodeURIComponent(titleId) + '/episodes/' + episodeNumber + '/servers/' + encodeURIComponent(serverId) + '/playback?attempt=' + sourceAttempt : null;
  const source = useApi<SourceResult>(sourcePath);
  const lastSynced = useRef({ at: 0, seconds: 0 });
  const mediaKey = title.status === 'ok' ? title.data.id + ':' + episodeNumber : titleId + ':' + episodeNumber;
  const preferences = preferencesState.status === 'ok' ? preferencesState.data : DEFAULT_PREFERENCES;

  useEffect(() => {
    if (servers.status === 'ok' && servers.data.items.length && !servers.data.items.some(item => item.id === serverId)) {
      setServerId(servers.data.items[0].id);
    }
  }, [servers.status, servers.status === 'ok' ? servers.data.items.map(item => item.id).join('|') : '', serverId]);

  useEffect(() => {
    let active = true;
    setSnapshotLoading(true);
    void loadMediaPlayback(account.user?.id ?? null, 'anime', mediaKey).then(value => {
      if (active) {
        snapshotRef.current = value;
        setSnapshot(value);
        lastSynced.current = { at: Date.now(), seconds: value?.progressSeconds ?? 0 };
      }
    }).finally(() => { if (active) setSnapshotLoading(false); });
    return () => { active = false; };
  }, [account.user?.id, mediaKey]);

  const saveProgress = useCallback((seconds: number, reason: PlaybackSaveReason, playerState: SavedPlayerState = {}, reportedDuration?: number | null) => {
    if (!Number.isFinite(seconds) || seconds < 0 || title.status !== 'ok') return;
    const now = Date.now();
    const previous = snapshotRef.current;
    const duration = typeof reportedDuration === 'number' && Number.isFinite(reportedDuration) && reportedDuration > 0
      ? reportedDuration
      : previous?.durationSeconds ?? null;
    const stateChanged = JSON.stringify(playerState) !== JSON.stringify(previous?.playerState ?? {});
    const next: MediaPlaybackSnapshot = {
      mediaType: 'anime', mediaKey: title.data.id + ':' + episodeNumber, title: title.data.title,
      artworkUrl: title.data.posterUrl, progressSeconds: duration ? Math.min(seconds, duration) : seconds,
      durationSeconds: duration, completed: reason === 'ended' || Boolean(duration && seconds >= duration - 2),
      playerState, updatedAt: now,
    };
    if (reason !== 'open' && (reason !== 'timeupdate' || now - lastLocalSavedAt.current >= 5_000)) {
      writeLocalMediaPlayback(account.user?.id ?? null, next);
      lastLocalSavedAt.current = now;
    }
    snapshotRef.current = next;
    if (!shouldSyncPlaybackProgress(reason, lastSynced.current.at, lastSynced.current.seconds, next.progressSeconds, now, stateChanged)) return;
    setSnapshot(next);
    lastSynced.current = { at: now, seconds: next.progressSeconds };
    void syncMediaPlayback(account.user?.id ?? null, next, reason === 'pagehide');
  }, [account.user?.id, episodeNumber, title.status === 'ok' ? title.data.id : '', title.status === 'ok' ? title.data.title : '', title.status === 'ok' ? title.data.posterUrl : null]);

  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) return <div className="page"><EmptyPanel title="Invalid episode" message="This watch link does not contain a valid episode number." action={<Link className="button button-primary" to="/anime">Browse anime</Link>} /></div>;
  if (title.status === 'loading' || servers.status === 'loading' || snapshotLoading) return <div className="page"><LoadingPanel label="Preparing your player…" /></div>;
  if (title.status === 'error') return <div className="page"><ItemError error={title.error} onRetry={title.reload} /></div>;
  if (servers.status === 'error') return <div className="page"><ItemError error={servers.error} onRetry={servers.reload} /></div>;
  if (servers.data.items.length === 0) return <div className="page"><EmptyPanel title="No playback servers available" message="The configured episode provider has no authorised playback source for this episode. No alternate source will be substituted." action={<Link className="button button-secondary" to={'/anime/' + encodeURIComponent(title.data.slug)}>Back to title</Link>} /></div>;

  const episodeTitle = 'Episode ' + episodeNumber;
  const nextUrl = preferences.autoplayNext ? '/watch/' + encodeURIComponent(title.data.id) + '/' + (episodeNumber + 1) : null;
  return (
    <div className="page watch-page">
      <div className="watch-header"><Link className="back-link" to={'/anime/' + encodeURIComponent(title.data.slug)}><ArrowLeft size={16} /> {title.data.title}</Link><span>{episodeTitle}</span></div>
      <div className="watch-toolbar">
        <label>Source <select value={serverId} onChange={event => setServerId(event.target.value)}>{servers.data.items.map(server => <option key={server.id} value={server.id}>{server.name} · {server.type.toUpperCase()}</option>)}</select></label>
        <span className="privacy-indicator"><Check size={14} /> Account progress sync</span>
      </div>
      {source.status === 'loading' && <div className="player-placeholder"><LoadingPanel label="Checking the selected source…" /></div>}
      {source.status === 'error' && <EmptyPanel title="This source is unavailable" message={source.error.message} action={<button className="button button-secondary" type="button" onClick={() => { setSourceAttempt(n => n + 1); source.reload(); }}>Retry source</button>} />}
      {source.status === 'ok' && <KairoMediaPlayer
        key={serverId + ':' + sourceAttempt}
        source={source.data.source}
        title={title.data.title + ' · ' + episodeTitle}
        progressKey={account.user!.id + ':' + mediaKey}
        nextUrl={nextUrl}
        initialPlayerState={snapshot?.playerState}
        initialProgressSeconds={snapshot?.progressSeconds ?? 0}
        defaultPlaybackSpeed={preferences.defaultPlaybackSpeed}
        defaultSubtitleLanguage={preferences.subtitleLanguage}
        subtitleSize={preferences.subtitleSize}
        onProgress={saveProgress}
      />}
      {source.status === 'ok' && snapshot && snapshot.progressSeconds > 15 && !snapshot.completed && <p className="inline-note">Resume point saved at {Math.floor(snapshot.progressSeconds / 60)}:{String(Math.floor(snapshot.progressSeconds % 60)).padStart(2, '0')}.</p>}
      {preferencesState.status === 'error' && <p className="inline-note">Player preferences could not be loaded; default playback behavior is active.</p>}
    </div>
  );
}

function MovieBrowsePage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? 'trending_week';
  const queryParam = params.get('q') ?? '';
  const [query, setQuery] = useState(queryParam);
  useEffect(() => setQuery(queryParam), [queryParam]);
  const page = Number(params.get('page') ?? 1);
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const path = queryParam.trim()
    ? '/movies/search?' + new URLSearchParams({ q: queryParam.trim(), page: String(safePage) }).toString()
    : '/movies/discover?' + new URLSearchParams({ kind, page: String(safePage) }).toString();
  const results = useApi<MoviePage>(path);
  const title = queryParam.trim() ? 'Movie search' : kind === 'trending_week' ? 'Trending movies' : kind.replaceAll('_', ' ');
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    setParams(q ? { q, page: '1' } : { kind, page: '1' });
  }
  return (
    <div className="page">
      <PageHeading eyebrow="MOVIES" title={title.charAt(0).toUpperCase() + title.slice(1)} description="Discover films and save them alongside your Anime library." />
      <div className="filter-bar movie-filter-bar">
        <form className="movie-search-inline" role="search" onSubmit={submitSearch}>
          <label>Search movies<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search films…" maxLength={120} /></label>
          <button className="button button-primary small" type="submit">Search</button>
          {queryParam && <button className="text-action" type="button" onClick={() => { setQuery(''); setParams({ kind, page: '1' }); }}>Clear search</button>}
        </form>
        {!queryParam && <label>Collection <select value={kind} onChange={event => setParams({ kind: event.target.value, page: '1' })}><option value="trending_week">Trending this week</option><option value="trending_day">Trending today</option><option value="popular">Popular</option><option value="top_rated">Top rated</option><option value="upcoming">Upcoming</option><option value="now_playing">Now playing</option></select></label>}
      </div>
      {results.status === 'loading' && <LoadingPanel label="Loading movie catalogue…" />}
      {results.status === 'error' && <ItemError error={results.error} onRetry={results.reload} />}
      {results.status === 'ok' && (results.data.items.length ? <PosterGrid items={results.data.items} kind="movie" /> : <EmptyPanel title="No movies found" message="Try another title or collection." />)}
      {results.status === 'ok' && results.data.totalPages > results.data.page && <div className="pagination"><button className="button button-secondary" onClick={() => setParams(queryParam ? { q: queryParam, page: String(page + 1) } : { kind, page: String(page + 1) })}>Next page</button></div>}
      <p className="provider-attribution">Movie metadata and artwork are supplied by TMDB when enabled. Kairo is not endorsed or certified by TMDB.</p>
    </div>
  );
}

function MovieDetailPage() {
  const { id = '' } = useParams();
  const detail = useApi<MovieDetail>('/movies/' + encodeURIComponent(id));
  const movieLibrary = useApi<PageData<MovieLibraryEntry>>('/me/movies/library');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'watchlist' | 'watched' | null>('watchlist');
  const [favorite, setFavorite] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (movieLibrary.status !== 'ok') return;
    const found = movieLibrary.data.items.find(item => item.providerId === 'tmdb' && item.externalId === id);
    if (found) {
      setStatus(found.status);
      setFavorite(Boolean(found.isFavorite));
    }
  }, [movieLibrary.status, movieLibrary.status === 'ok' ? movieLibrary.data.items.length : 0, id]);
  async function save() {
    setSaving(true); setNotice('');
    try {
      await authRequest('/me/movies/library', { method: 'POST', body: JSON.stringify({ providerId: 'tmdb', externalId: id, status, isFavorite: favorite, rating: null }) });
      setNotice('Saved to your account library.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save this movie.'); }
    finally { setSaving(false); }
  }
  if (detail.status === 'loading') return <div className="page"><LoadingPanel label="Loading movie details…" /></div>;
  if (detail.status === 'error') return <div className="page"><ItemError error={detail.error} onRetry={detail.reload} /></div>;
  const movie = detail.data;
  return (
    <div className="page detail-page">
      <Link to="/movies" className="back-link"><ArrowLeft size={16} /> Back to movies</Link>
      <section className="movie-detail-hero">
        {safeImageUrl(movie.backdropUrl) && <img className="detail-backdrop" src={safeImageUrl(movie.backdropUrl) ?? undefined} alt="" />}
        <div className="detail-gradient" />
        <div className="movie-detail-copy">
          <p className="eyebrow">MOVIE · TMDB</p>
          <h1>{movie.title}</h1>
          {movie.tagline && <p className="movie-tagline">{movie.tagline}</p>}
          <p className="detail-meta">{[movieYear(movie), movie.runtimeMinutes ? movie.runtimeMinutes + ' min' : null, movieRating(movie.voteAverage) ? '★ ' + movieRating(movie.voteAverage) : null, movie.releaseStatus].filter(Boolean).join(' · ')}</p>
          <p className="detail-synopsis">{movie.overview || 'No synopsis is available.'}</p>
          <div className="chip-row">{movie.genres.map(genre => <span className="chip" key={genre.externalId}>{genre.name}</span>)}</div>
          <div className="detail-actions">
            <Link className="button button-primary" to={'/watch/movie/' + encodeURIComponent(id)}>Play movie</Link>
            <select aria-label="Movie list" value={status ?? ''} onChange={event => setStatus(event.target.value as 'watchlist' | 'watched' | null)}><option value="watchlist">Watchlist</option><option value="watched">Watched</option><option value="">No list</option></select>
            <button className="button button-secondary" onClick={() => setFavorite(v => !v)} type="button"><Heart size={16} fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'Favorited' : 'Favorite'}</button>
            <button className="button button-secondary" disabled={saving} onClick={() => { void save(); }} type="button">{saving ? 'Saving…' : 'Save'}</button>
          </div>
          {notice && <p className="inline-note" role="status">{notice}</p>}
          <p className="provider-attribution">Movie metadata and artwork from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
      </section>
      {(movie.cast.length > 0 || movie.crew.length > 0) && <section className="content-section"><SectionHeading title="Cast and crew" /><div className="credits-grid">{movie.cast.slice(0, 12).map((person, index) => <div className="credit-card" key={person.externalPersonId ?? person.name + index}>{safeImageUrl(person.profileUrl) && <img src={safeImageUrl(person.profileUrl) ?? undefined} alt="" loading="lazy" />}<strong>{person.name}</strong><small>{person.character || person.job || 'Cast'}</small></div>)}</div></section>}
    </div>
  );
}

function MovieWatchPage() {
  const { id = '' } = useParams();
  const detail = useApi<MovieDetail>('/movies/' + encodeURIComponent(id));
  const account = useAccount();
  const [snapshot, setSnapshot] = useState<MediaPlaybackSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadMediaPlayback(account.user?.id ?? null, 'movie', id).then(value => { if (active) setSnapshot(value); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account.user?.id, id]);
  const onProgress = useCallback((value: MediaPlaybackSnapshot, _reason: PlaybackSaveReason) => {
    setSnapshot(value);
    void syncMediaPlayback(account.user?.id ?? null, value, _reason === 'pagehide' || _reason === 'close');
  }, [account.user?.id]);
  if (detail.status === 'loading' || loading) return <div className="page"><LoadingPanel label="Preparing movie player…" /></div>;
  if (detail.status === 'error') return <div className="page"><ItemError error={detail.error} onRetry={detail.reload} /></div>;
  return (
    <div className="page movie-watch-page">
      <div className="watch-header"><Link className="back-link" to={movieHref(detail.data)}><ArrowLeft size={16} /> {detail.data.title}</Link><span>Now playing</span></div>
      <MovieEmbedPlayer
        tmdbId={id}
        title={detail.data.title}
        posterUrl={detail.data.posterUrl}
        initialPlayback={snapshot}
        onProgress={onProgress}
        onBack={() => window.history.back()}
      />
      <p className="provider-attribution">Movie playback is provided by the official CineSrc embed. Kairo does not extract or proxy video streams.</p>
    </div>
  );
}

function LibraryPage() {
  const anime = useApi<AnimeLibraryPayload>('/me/library');
  const movies = useApi<PageData<MovieLibraryEntry>>('/me/movies/library');
  const [filter, setFilter] = useState('all');
  const [resolvedReferences, setResolvedReferences] = useState<AnimeLibraryEntry[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const referenceKey = anime.status === 'ok'
    ? (anime.data.references ?? []).map(item => item.providerId + ':' + item.externalId + ':' + item.slug).join('|')
    : '';
  useEffect(() => {
    if (anime.status !== 'ok') { setResolvedReferences([]); return; }
    const references = anime.data.references ?? [];
    let active = true;
    if (!references.length) { setResolvedReferences([]); setReferencesLoading(false); return; }
    setReferencesLoading(true);
    const items: AnimeLibraryEntry[] = new Array(references.length);
    let cursor = 0;
    const resolveNext = async () => {
      while (active) {
        const index = cursor++;
        if (index >= references.length) return;
        const reference = references[index];
        try {
          const title = await apiGet<AnimeDetails>('/anime/' + encodeURIComponent(reference.slug));
          items[index] = {
            animeId: reference.slug,
            slug: title.slug || reference.slug,
            title: title.title,
            posterUrl: title.posterUrl,
            status: reference.status ?? 'plan_to_watch',
            isFavorite: reference.isFavorite,
            addedAt: reference.addedAt,
            updatedAt: reference.updatedAt,
          };
        } catch {
          items[index] = {
            animeId: reference.slug,
            slug: reference.slug,
            title: 'Unavailable Anime (' + reference.providerId + ' ' + reference.externalId + ')',
            posterUrl: null,
            status: reference.status ?? 'plan_to_watch',
            isFavorite: reference.isFavorite,
            addedAt: reference.addedAt,
            updatedAt: reference.updatedAt,
          };
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(8, references.length) }, () => resolveNext()))
      .then(() => { if (active) setResolvedReferences(items); })
      .finally(() => { if (active) setReferencesLoading(false); });
    return () => { active = false; };
  }, [anime.status, referenceKey]);
  const allAnimeItems = anime.status === 'ok' ? [...anime.data.items, ...resolvedReferences] : [];
  const filtered = allAnimeItems.filter(item => filter === 'all' || item.status === filter || (filter === 'favorites' && Boolean(item.isFavorite)));
  async function updateStatus(item: AnimeLibraryEntry, status: string) {
    await authRequest('/me/library/' + encodeURIComponent(item.animeId), { method: 'PUT', body: JSON.stringify({ status: status || null, isFavorite: Boolean(item.isFavorite) }) });
    anime.reload();
  }
  async function remove(item: AnimeLibraryEntry) {
    await authRequest('/me/library/' + encodeURIComponent(item.animeId), { method: 'DELETE' });
    anime.reload();
  }
  return (
    <div className="page">
      <PageHeading eyebrow="YOUR ACCOUNT" title="My Library" description="Your saved titles and lists, synced to your Kairo account." />
      <div className="library-tabs" role="group" aria-label="Filter Anime library">
        {['all', 'watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped', 'favorites'].map(key => <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{key === 'all' ? 'All Anime' : key.replaceAll('_', ' ')}</button>)}
      </div>
      {anime.status === 'loading' && <LoadingPanel label="Loading your library…" />}
      {anime.status === 'error' && <ItemError error={anime.error} onRetry={anime.reload} />}
      {anime.status === 'ok' && referencesLoading && <LoadingPanel label="Resolving saved Anime titles…" />}
      {anime.status === 'ok' && !referencesLoading && filtered.length === 0 && <EmptyPanel title="No saved Anime here" message="Add titles from their detail pages to start building your library." action={<Link className="button button-primary" to="/anime">Explore Anime</Link>} />}
      {filtered.length > 0 && <div className="library-list">{filtered.map(item => <article className="library-row" key={item.animeId}>
        <Link to={'/anime/' + encodeURIComponent(item.slug)} className="library-art">{safeImageUrl(item.posterUrl) && <img src={safeImageUrl(item.posterUrl) ?? undefined} alt="" loading="lazy" />}</Link>
        <div className="library-info"><Link to={'/anime/' + encodeURIComponent(item.slug)}><strong>{item.title}</strong></Link><small>{item.status.replaceAll('_', ' ')}{item.isFavorite ? ' · Favourite' : ''}</small></div>
        <label className="sr-only" htmlFor={'library-status-' + item.animeId}>Status for {item.title}</label>
        <select id={'library-status-' + item.animeId} value={item.status} onChange={event => { void updateStatus(item, event.target.value).catch(() => undefined); }}><option value="watching">Watching</option><option value="plan_to_watch">Plan to watch</option><option value="completed">Completed</option><option value="on_hold">On hold</option><option value="dropped">Dropped</option></select>
        <button type="button" className="text-action danger" onClick={() => { void remove(item).catch(() => undefined); }}>Remove</button>
      </article>)}</div>}
      <section className="content-section">
        <SectionHeading title="Movies" description="Saved TMDB movie references." />
        {movies.status === 'loading' && <LoadingPanel />}
        {movies.status === 'error' && <ItemError error={movies.error} onRetry={movies.reload} />}
        {movies.status === 'ok' && movies.data.items.length === 0 && <p className="muted-text">No saved movies yet.</p>}
        {movies.status === 'ok' && movies.data.items.map(item => <article className="library-row compact" key={item.providerId + item.externalId}>
          <div className="library-art movie-art"><Film size={24} /></div>
          <div className="library-info"><Link to={'/movies/' + encodeURIComponent(item.externalId)}><strong>Saved movie · TMDB #{item.externalId}</strong></Link><small>{item.status ?? 'Favourite'}{item.isFavorite ? ' · Favourite' : ''}{item.rating !== null ? ' · ' + item.rating.toFixed(1) : ''}</small></div>
          <Link className="text-action" to={'/movies/' + encodeURIComponent(item.externalId)}>View details</Link>
          <button type="button" className="text-action danger" onClick={() => { void authRequest('/me/movies/library/tmdb/' + encodeURIComponent(item.externalId), { method: 'DELETE' }).then(movies.reload).catch(() => undefined); }}>Remove</button>
        </article>)}
      </section>
    </div>
  );
}

function HistoryPage() {
  const account = useAccount();
  const history = useApi<PageData<PlaybackItem>>('/me/playback?limit=100');
  const preferences = useApi<Preferences>('/me/preferences');
  const [busy, setBusy] = useState('');
  async function remove(item: PlaybackItem) {
    setBusy(item.mediaType + item.mediaKey);
    try {
      await deleteMediaPlayback(account.user?.id ?? null, item.mediaType, item.mediaKey);
      history.reload();
    } finally { setBusy(''); }
  }
  async function togglePause(paused: boolean) {
    await authRequest('/me/preferences', { method: 'PUT', body: JSON.stringify({ historyPaused: paused }) });
    preferences.reload();
  }
  const items = history.status === 'ok' ? history.data.items.filter(item => item.mediaType !== 'youtube') : [];
  return (
    <div className="page">
      <PageHeading eyebrow="YOUR ACCOUNT" title="Watch history" description="Recent playback and saved resume points across Kairo." />
      {preferences.status === 'ok' && <div className="preference-callout"><div><strong>Pause watch history</strong><p>When paused, new playback positions are not saved to your Kairo history.</p></div><label className="switch-label"><input type="checkbox" checked={preferences.data.historyPaused} onChange={event => { void togglePause(event.target.checked).catch(() => undefined); }} /><span>{preferences.data.historyPaused ? 'Paused' : 'Recording'}</span></label></div>}
      {history.status === 'loading' && <LoadingPanel />}
      {history.status === 'error' && <ItemError error={history.error} onRetry={history.reload} />}
      {history.status === 'ok' && items.length === 0 && <EmptyPanel title="Your history is empty" message="When you watch something, your progress will appear here so you can continue later." />}
      <div className="history-list">{items.map(item => {
        const pct = item.durationSeconds ? Math.min(100, item.progressSeconds / item.durationSeconds * 100) : 0;
        const href = item.mediaType === 'movie' ? '/watch/movie/' + encodeURIComponent(item.mediaKey) : (() => {
          const parts = item.mediaKey.match(/^(.+):(\d+)$/);
          return parts ? '/watch/' + encodeURIComponent(parts[1]) + '/' + parts[2] : '/anime';
        })();
        return <article className="history-row" key={item.mediaType + item.mediaKey}>
          <div className="history-art">{item.artworkUrl ? <img src={item.artworkUrl} alt="" loading="lazy" /> : <Film size={23} />}<span><i style={{ width: pct + '%' }} /></span></div>
          <div className="history-info"><strong>{item.title}</strong><small>{item.mediaType.toUpperCase()} · {item.completed ? 'Completed' : Math.floor(item.progressSeconds / 60) + ' minutes watched'}</small><small>{new Date(item.updatedAt).toLocaleString()}</small></div>
          <Link className="button button-secondary small" to={href}>{item.completed ? 'Watch again' : 'Resume'}</Link>
          <button className="text-action danger" disabled={busy === item.mediaType + item.mediaKey} onClick={() => { void remove(item).catch(() => undefined); }} type="button">Remove</button>
        </article>;
      })}</div>
    </div>
  );
}

function PublicProfilePage() {
  const { username = '' } = useParams();
  const state = useApi<{ profile: Omit<Profile, 'id' | 'email' | 'visibility' | 'updatedAt'> }>('/profiles/' + encodeURIComponent(username));
  if (state.status === 'loading') return <div className="page"><LoadingPanel label="Loading public profile…" /></div>;
  if (state.status === 'error') return <div className="page"><ItemError error={state.error} onRetry={state.reload} /></div>;
  const profile = state.data.profile;
  return (
    <div className="page">
      <Link className="back-link" to="/"><ArrowLeft size={16} /> Back to Kairo</Link>
      <section className="settings-card public-profile-card">
        <div className="profile-avatar">{profile.displayName.slice(0, 1).toUpperCase() || <UserRound />}</div>
        <div><h1>{profile.displayName}</h1><p className="muted-text">@{profile.username}</p></div>
        <p>{profile.bio || 'This profile has not added a bio yet.'}</p>
        <small className="muted-text">Kairo member since {dateLabel(profile.createdAt) ?? '—'}</small>
      </section>
    </div>
  );
}

function ProfilePage() {
  const state = useApi<{ profile: Profile }>('/me/profile');
  const account = useAccount();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (state.status === 'ok') {
      setDisplayName(state.data.profile.displayName);
      setBio(state.data.profile.bio);
      setVisibility(state.data.profile.visibility);
    }
  }, [state.status, state.status === 'ok' ? state.data.profile.updatedAt : '']);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      await authRequest('/me/profile', { method: 'PUT', body: JSON.stringify({ displayName, bio, visibility }) });
      state.reload(); setNotice('Profile updated.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update your profile.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="page">
      <PageHeading eyebrow="YOUR ACCOUNT" title="Profile" description="Manage the profile details associated with your Kairo account." />
      {state.status === 'loading' && <LoadingPanel />}
      {state.status === 'error' && <ItemError error={state.error} onRetry={state.reload} />}
      {state.status === 'ok' && <div className="settings-card profile-card">
        <div className="profile-avatar">{displayName.slice(0, 1).toUpperCase() || <UserRound />}</div>
        <div><h2>{displayName || state.data.profile.displayName}</h2><p>@{account.user?.username} · Joined {dateLabel(state.data.profile.createdAt) ?? 'Kairo'}</p></div>
        <form className="settings-form" onSubmit={submit}>
          <label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={2} maxLength={40} required /></label>
          <label>Bio<textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={280} rows={4} /></label>
          <label>Profile visibility<select value={visibility} onChange={event => setVisibility(event.target.value as 'private' | 'public')}><option value="private">Private</option><option value="public">Public</option></select></label>
          <p className="muted-text">Only your username, display name, avatar and bio are shown on a public profile. Email, library and watch history remain private.</p>
          {visibility === 'public' && account.user?.username && <Link className="text-action" to={'/users/' + encodeURIComponent(account.user.username)}>View your public profile</Link>}
          {notice && <p className="inline-note" role="status">{notice}</p>}
          <button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        </form>
      </div>}
    </div>
  );
}

function SettingsPage() {
  const account = useAccount();
  const state = useApi<Preferences>('/me/preferences');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmUsername, setConfirmUsername] = useState('');
  const navigate = useNavigate();
  const prefs = state.status === 'ok' ? state.data : DEFAULT_PREFERENCES;
  async function update(patch: Partial<Preferences>) {
    setBusy(true); setNotice('');
    try {
      await authRequest('/me/preferences', { method: 'PUT', body: JSON.stringify(patch) });
      state.reload();
      if (patch.theme) document.documentElement.dataset.theme = patch.theme;
      setNotice('Preferences saved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save preferences.'); }
    finally { setBusy(false); }
  }
  async function exportData() {
    setExporting(true);
    try {
      const result = await authRequest<Record<string, unknown>>('/me/export', { method: 'GET' });
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'kairo-account-export.json'; anchor.click();
      URL.revokeObjectURL(url);
      setNotice('Your account export was created.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not export your account.'); }
    finally { setExporting(false); }
  }
  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm('Permanently delete your Kairo account and its saved account data? This cannot be undone.')) return;
    setDeleting(true); setNotice('');
    try {
      await authRequest('/me/account', { method: 'DELETE', body: JSON.stringify({ currentPassword: password, confirmUsername }) });
      await account.refresh();
      navigate('/login', { replace: true });
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete this account.'); }
    finally { setDeleting(false); }
  }
  return (
    <div className="page">
      <PageHeading eyebrow="YOUR ACCOUNT" title="Settings" description="Choose how Kairo looks, plays, and remembers your activity." />
      {state.status === 'loading' && <LoadingPanel />}
      {state.status === 'error' && <ItemError error={state.error} onRetry={state.reload} />}
      {state.status === 'ok' && <>
        <section className="settings-card">
          <h2>Appearance</h2>
          <label>Theme<select value={prefs.theme} onChange={event => { void update({ theme: event.target.value as Preferences['theme'] }); }} disabled={busy}><option value="astral-plum">Astral Plum</option><option value="sakura-ember">Sakura Ember</option><option value="ocean-circuit">Ocean Circuit</option><option value="moonlit-jade">Moonlit Jade</option></select></label>
        </section>
        <section className="settings-card">
          <h2>Playback</h2>
          <label>Subtitle language<select value={prefs.subtitleLanguage} onChange={event => { void update({ subtitleLanguage: event.target.value }); }} disabled={busy}><option value="en">English</option><option value="ja">Japanese</option><option value="es">Spanish</option><option value="fr">French</option><option value="pt">Portuguese</option><option value="off">Off</option></select></label>
          <label>Subtitle size<select value={prefs.subtitleSize} onChange={event => { void update({ subtitleSize: event.target.value as Preferences['subtitleSize'] }); }} disabled={busy}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
          <label>Default playback speed<select value={prefs.defaultPlaybackSpeed} onChange={event => { void update({ defaultPlaybackSpeed: Number(event.target.value) }); }} disabled={busy}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => <option value={speed} key={speed}>{speed}×</option>)}</select></label>
          <label className="check-row"><input type="checkbox" checked={prefs.autoplayNext} onChange={event => { void update({ autoplayNext: event.target.checked }); }} disabled={busy} /> Autoplay the next episode</label>
        </section>
        <section className="settings-card">
          <h2>Privacy</h2>
          <label className="check-row"><input type="checkbox" checked={prefs.historyPaused} onChange={event => { void update({ historyPaused: event.target.checked }); }} disabled={busy} /> Pause watch history recording</label>
          <p className="muted-text">When paused, your browser may keep a local resume point, but new progress is not synced to your account or other devices.</p>
          <button className="button button-secondary" type="button" disabled={exporting} onClick={() => { void exportData(); }}>{exporting ? 'Preparing export…' : 'Export my account data'}</button>
        </section>
        <section className="settings-card danger-card">
          <h2>Delete account</h2>
          <p>This permanently removes your standard Kairo account and its account-owned data. Administrator accounts require a separate recovery process and cannot be self-deleted.</p>
          {account.user?.role === 'admin' ? <p className="muted-text">Self-service deletion is disabled for administrator accounts.</p> : <form className="settings-form" onSubmit={deleteAccount}>
            <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
            <label>Type your username to confirm<input value={confirmUsername} onChange={event => setConfirmUsername(event.target.value)} required /></label>
            <button className="button button-danger" disabled={deleting}>{deleting ? 'Deleting account…' : 'Permanently delete account'}</button>
          </form>}
        </section>
      </>}
      {notice && <p className="inline-note" role="status">{notice}</p>}
    </div>
  );
}

function AdminConsolePage() {
  const state = useApi<{ accounts: AdminAccount[]; standardAccountCount: number; standardAccountLimit: number }>('/admin/accounts');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [oneTimeSecret, setOneTimeSecret] = useState('');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setOneTimeSecret('');
    try {
      const result = await authRequest<{ temporaryPassword: string; username: string }>('/admin/accounts', {
        method: 'POST', body: JSON.stringify({ username, displayName }),
      });
      setOneTimeSecret('Username: ' + result.data.username + '\nTemporary password: ' + result.data.temporaryPassword);
      setUsername(''); setDisplayName(''); setMessage('Account created. Copy the temporary password now; it will not be shown again.');
      state.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create account.'); }
    finally { setBusy(false); }
  }
  async function accountAction(id: string, action: 'enroll' | 'reset' | 'suspend' | 'activate' | 'delete') {
    setMessage(''); setOneTimeSecret('');
    try {
      if (action === 'enroll') {
        const newUsername = window.prompt('Choose a username for this existing account (3–32 characters).')?.trim() ?? '';
        if (!newUsername) return;
        const result = await authRequest<{ temporaryPassword: string; username: string }>('/admin/accounts/' + encodeURIComponent(id) + '/enroll', {
          method: 'POST', body: JSON.stringify({ username: newUsername }),
        });
        setOneTimeSecret('Username: ' + result.data.username + '\nTemporary password: ' + result.data.temporaryPassword);
        setMessage('Existing account enrolled. Deliver the temporary password securely; it must be changed at next sign-in.');
      } else if (action === 'reset') {
        const result = await authRequest<{ temporaryPassword: string; username?: string }>('/admin/accounts/' + encodeURIComponent(id) + '/password', { method: 'POST' });
        setOneTimeSecret('Temporary password: ' + result.data.temporaryPassword);
        setMessage('Password reset. Deliver this temporary password securely; the user must change it on next sign-in.');
      } else if (action === 'suspend' || action === 'activate') {
        await authRequest('/admin/accounts/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: JSON.stringify({ status: action === 'suspend' ? 'suspended' : 'active' }) });
        setMessage('Account status updated.');
      } else {
        if (!window.confirm('Permanently delete this account and all its account-owned data?')) return;
        await authRequest('/admin/accounts/' + encodeURIComponent(id), { method: 'DELETE', body: JSON.stringify({ confirmDataDeletion: true }) });
        setMessage('Account deleted. A minimal tombstone is retained.');
      }
      state.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The account action failed.'); }
  }
  if (state.status === 'loading') return <div className="page"><LoadingPanel label="Loading administrator console…" /></div>;
  if (state.status === 'error') return <div className="page"><ItemError error={state.error} onRetry={state.reload} /></div>;
  const data = state.data;
  return (
    <div className="page">
      <PageHeading eyebrow="RESTRICTED AREA" title="Account management" description="Create, enroll, reset, suspend, reactivate, and remove standard accounts." />
      <div className="admin-count"><Shield size={20} /><strong>{data.standardAccountCount} / {data.standardAccountLimit}</strong><span>standard accounts allocated</span></div>
      <section className="settings-card">
        <h2>Create standard account</h2>
        <form className="settings-form admin-create-form" onSubmit={create}>
          <label>Username<input value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={32} autoCapitalize="none" required /></label>
          <label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={2} maxLength={40} required /></label>
          <button className="button button-primary" disabled={busy || data.standardAccountCount >= data.standardAccountLimit}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
      </section>
      {oneTimeSecret && <section className="one-time-secret" aria-live="polite"><strong>One-time credential — copy it now</strong><pre>{oneTimeSecret}</pre><button className="button button-secondary" type="button" onClick={() => { void navigator.clipboard?.writeText(oneTimeSecret); }}>Copy credential</button></section>}
      {message && <p className="inline-note" role="status">{message}</p>}
      <section className="content-section">
        <SectionHeading title="Standard accounts" description="Temporary passwords are only displayed in the response that creates or resets them." />
        <div className="admin-account-list">{data.accounts.map(item => <article className="admin-account-row" key={item.id}>
          <div><strong>{item.displayName}</strong><small>@{item.username ?? 'not enrolled'} · {item.status} · {item.credentialsConfigured ? 'Credentials set' : 'Needs enrolment'}{item.mustChangePassword ? ' · Must change password' : ''}</small></div>
          <div className="admin-account-actions">
            {item.credentialsConfigured ? <button className="text-action" type="button" onClick={() => { void accountAction(item.id, 'reset'); }}>Reset password</button> : <button className="text-action" type="button" onClick={() => { void accountAction(item.id, 'enroll'); }}>Enroll account</button>}
            {item.status === 'suspended' ? <button className="text-action" type="button" onClick={() => { void accountAction(item.id, 'activate'); }}>Reactivate</button> : <button className="text-action" type="button" onClick={() => { void accountAction(item.id, 'suspend'); }}>Suspend</button>}
            <button className="text-action danger" type="button" onClick={() => { void accountAction(item.id, 'delete'); }}>Delete</button>
          </div>
        </article>)}</div>
      </section>
    </div>
  );
}

function CatchAllPage({ adminPath }: { adminPath: string | null }) {
  const location = useLocation();
  const account = useAccount();
  if (account.user?.role === 'admin' && adminPath && location.pathname === adminPath) return <AdminConsolePage />;
  return <div className="page"><EmptyPanel title="Page not found" message="This page does not exist or is not available to this account." action={<Link className="button button-primary" to="/">Return to Discover</Link>} /></div>;
}

function WorkspaceRoutes() {
  const account = useAccount();
  const adminPathState = useApi<{ path: string }>(account.user?.role === 'admin' ? '/admin/console-path' : null);
  const adminPath = adminPathState.status === 'ok' ? adminPathState.data.path : null;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DiscoverPage />} />
        <Route path="anime" element={<AnimeBrowsePage />} />
        <Route path="seasonal" element={<AnimeBrowsePage seasonal />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="anime/:id" element={<AnimeDetailPage />} />
        <Route path="watch/:titleId/:episodeNumber" element={<AnimeWatchPage />} />
        <Route path="movies" element={<MovieBrowsePage />} />
        <Route path="movies/:id" element={<MovieDetailPage />} />
        <Route path="watch/movie/:id" element={<MovieWatchPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="users/:username" element={<PublicProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<CatchAllPage adminPath={adminPath} />} />
      </Route>
    </Routes>
  );
}

export default function KairoApp() {
  return <WorkspaceRoutes />;
}
