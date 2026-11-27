import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Filter, Search, X, Youtube } from 'lucide-react';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';
import { useAccountScope } from '../hooks/useAccountScope';
import { readGuestYouTubeHistory } from '../lib/youtubeLocalLibrary';

type SearchMode = 'videos' | 'channels';
type SearchFilter = 'all' | 'shorts' | 'unwatched' | 'videos' | 'recent' | 'live';
type SearchOptions = {
  order: 'relevance' | 'date' | 'viewCount';
  duration: 'any' | 'short' | 'medium' | 'long';
  uploadDate: 'any' | 'today' | 'week' | 'month' | 'year';
  filter: SearchFilter;
};
type ChannelResult = { channelId: string; title: string; description: string; thumbnailUrl: string | null; url: string };
type VideoResult = YouTubeCardVideo & { url: string; description: string };
type SearchError = { code: string; message: string };

const DEFAULT_OPTIONS: SearchOptions = {
  order: 'relevance',
  duration: 'any',
  uploadDate: 'any',
  filter: 'all',
};

function isShort(video: Pick<VideoResult, 'title' | 'description'>): boolean {
  return /(?:^|\s)#(?:youtube)?shorts?\b/i.test((video.title || '') + ' ' + (video.description || ''));
}

function parseOptions(params: URLSearchParams): SearchOptions {
  const order = params.get('order');
  const duration = params.get('duration');
  const uploadDate = params.get('uploadDate');
  const filter = params.get('filter');
  return {
    order: order === 'date' || order === 'viewCount' ? order : 'relevance',
    duration: duration === 'short' || duration === 'medium' || duration === 'long' ? duration : 'any',
    uploadDate: uploadDate === 'today' || uploadDate === 'week' || uploadDate === 'month' || uploadDate === 'year' ? uploadDate : 'any',
    filter: filter === 'shorts' || filter === 'unwatched' || filter === 'videos' || filter === 'recent' || filter === 'live' ? filter : 'all',
  };
}

function buildSearchUrl(term: string, mode: SearchMode, options: SearchOptions): string {
  const params = new URLSearchParams({ q: term, type: mode });
  if (mode === 'videos') {
    params.set('order', options.filter === 'recent' ? 'date' : options.order);
    params.set('duration', options.duration);
    params.set('uploadDate', options.uploadDate);
    params.set('filter', options.filter);
  }
  return '/youtube/search?' + params.toString();
}

async function readWatchedIds(accountId: string | null): Promise<Set<string>> {
  if (!accountId) return new Set(readGuestYouTubeHistory().map(item => item.videoId));
  try {
    const response = await fetch('/api/v1/youtube/history', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) return new Set();
    const items = Array.isArray(payload.data?.items) ? payload.data.items : [];
    return new Set(items.map((item: { videoId?: string }) => item.videoId).filter((id: unknown): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export default function YouTubeSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestId = useRef(0);
  const { accountId, resolved } = useAccountScope();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('videos');
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_OPTIONS);
  const [draftOptions, setDraftOptions] = useState<SearchOptions>(DEFAULT_OPTIONS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [channels, setChannels] = useState<ChannelResult[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);

  useEffect(() => {
    if (!resolved) return;
    let active = true;
    void readWatchedIds(accountId).then(ids => { if (active) setWatchedIds(ids); });
    return () => { active = false; };
  }, [accountId, resolved]);

  const searchFor = useCallback(async (
    term: string,
    selectedMode: SearchMode,
    selectedOptions: SearchOptions,
    pageToken?: string,
    append = false,
  ) => {
    const currentRequest = ++requestId.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setVideos([]);
      setChannels([]);
      setNextPageToken(null);
      setTotalResults(null);
    }
    setError(null);
    setSearched(true);
    try {
      let endpoint: string;
      if (selectedMode === 'channels') {
        endpoint = '/api/v1/youtube/channels/search?q=' + encodeURIComponent(term);
      } else {
        const params = new URLSearchParams({
          q: term,
          order: selectedOptions.filter === 'recent' ? 'date' : selectedOptions.order,
          duration: selectedOptions.duration,
          uploadDate: selectedOptions.uploadDate,
        });
        if (selectedOptions.filter === 'live') params.set('eventType', 'live');
        if (pageToken) params.set('pageToken', pageToken);
        endpoint = '/api/v1/youtube/videos/search?' + params.toString();
      }
      const response = await fetch(endpoint, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw { code: payload?.error?.code ?? 'YOUTUBE_SEARCH_UNAVAILABLE', message: payload?.error?.message ?? 'YouTube search is unavailable.' };
      }
      if (currentRequest !== requestId.current) return;
      if (selectedMode === 'channels') {
        setChannels(payload.data?.channels ?? []);
      } else {
        const pageVideos = (payload.data?.videos ?? []) as VideoResult[];
        setVideos(current => {
          if (!append) return pageVideos;
          const seen = new Set(current.map(video => video.videoId));
          return [...current, ...pageVideos.filter(video => !seen.has(video.videoId))];
        });
        setNextPageToken(payload.data?.nextPageToken ?? null);
        setTotalResults(typeof payload.data?.totalResults === 'number' ? payload.data.totalResults : null);
      }
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      const issue = caught as { code?: string; message?: string };
      setError({ code: issue.code ?? 'YOUTUBE_SEARCH_UNAVAILABLE', message: issue.message ?? 'YouTube search is unavailable.' });
      if (selectedMode === 'channels') setChannels([]);
      else if (!append) setVideos([]);
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const term = (params.get('q') ?? '').trim().slice(0, 80);
    const selectedMode: SearchMode = params.get('type') === 'channels' ? 'channels' : 'videos';
    const selectedOptions = parseOptions(params);
    setQuery(term);
    setMode(selectedMode);
    setOptions(selectedOptions);
    setDraftOptions(selectedOptions);
    if (term.length >= 2) void searchFor(term, selectedMode, selectedOptions);
    else {
      requestId.current += 1;
      setVideos([]);
      setChannels([]);
      setNextPageToken(null);
      setTotalResults(null);
      setError(null);
      setSearched(false);
      setLoading(false);
      setLoadingMore(false);
    }
  }, [location.search, searchFor]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtersOpen]);

  const openSearch = (term: string, selectedMode = mode, selectedOptions = options) => {
    const clean = term.trim().slice(0, 80);
    if (clean.length < 2) return;
    navigate(buildSearchUrl(clean, selectedMode, selectedOptions));
  };

  const chooseFilter = (filter: SearchFilter) => {
    const nextOptions: SearchOptions = {
      ...options,
      filter,
      order: filter === 'recent' ? 'date' : options.order,
    };
    openSearch(query, mode, nextOptions);
  };

  const applyFilters = () => {
    const nextOptions = { ...draftOptions };
    setFiltersOpen(false);
    openSearch(query, mode, nextOptions);
  };

  const loadMore = () => {
    if (!nextPageToken || loadingMore || loading || mode !== 'videos') return;
    void searchFor(query, mode, options, nextPageToken, true);
  };

  const visibleVideos = useMemo(() => {
    let result = [...videos];
    if (options.filter === 'shorts') result = result.filter(isShort);
    if (options.filter === 'videos') result = result.filter(video => !isShort(video));
    if (options.filter === 'unwatched') result = result.filter(video => !watchedIds.has(video.videoId));
    if (options.filter === 'recent') result.sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''));
    return result;
  }, [options.filter, videos, watchedIds]);

  const needsLogin = error?.code === 'AUTH_REQUIRED';
  const relatedVideos: YouTubeCardVideo[] = visibleVideos;

  return (
    <section className="yt-page yt-search-page">
      <header className="yt-page-heading yt-search-heading">
        <div>
          <span className="yt-eyebrow">YOUTUBE DISCOVERY</span>
          <h1>{query ? 'Results for “' + query + '”' : 'Search videos and creators'}</h1>
          <p>{query ? 'Explore videos, Shorts and channels matching your search.' : 'Search for a video, topic or creator from the Kairo search bar above.'}</p>
        </div>
      </header>

      <div className="yt-search-modes" role="tablist" aria-label="Search type">
        <button type="button" role="tab" aria-selected={mode === 'videos'} className={mode === 'videos' ? 'active' : ''} onClick={() => openSearch(query, 'videos')}>Videos</button>
        <button type="button" role="tab" aria-selected={mode === 'channels'} className={mode === 'channels' ? 'active' : ''} onClick={() => openSearch(query, 'channels')}>Channels</button>
      </div>

      {mode === 'videos' && (
        <>
          <div className="yt-search-filter-toolbar">
            <nav className="yt-search-filter-chips" aria-label="Video result filters">
              {([
                ['all', 'All'],
                ['shorts', 'Shorts'],
                ['unwatched', 'Unwatched'],
                ['videos', 'Videos'],
                ['recent', 'Recently uploaded'],
                ['live', 'Live'],
              ] as Array<[SearchFilter, string]>).map(([id, label]) => (
                <button key={id} type="button" className={options.filter === id ? 'active' : ''} aria-pressed={options.filter === id} onClick={() => chooseFilter(id)}>{label}</button>
              ))}
            </nav>
            <button type="button" className="yt-filter-open" onClick={() => { setDraftOptions(options); setFiltersOpen(true); }}>
              Filters <Filter size={15} />
            </button>
          </div>

          {filtersOpen && (
            <div className="yt-filter-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFiltersOpen(false); }}>
              <section className="yt-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="yt-filter-title">
                <header><h2 id="yt-filter-title">Search filters</h2><button type="button" aria-label="Close search filters" onClick={() => setFiltersOpen(false)}><X size={20} /></button></header>
                <div className="yt-filter-columns">
                  <fieldset>
                    <legend>Type</legend>
                    <button type="button" className={draftOptions.filter === 'all' || draftOptions.filter === 'videos' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, filter: 'all' }))}>Videos</button>
                    <button type="button" className={draftOptions.filter === 'shorts' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, filter: 'shorts' }))}>Shorts</button>
                    <button type="button" onClick={() => { setFiltersOpen(false); openSearch(query, 'channels'); }}>Channels</button>
                  </fieldset>
                  <fieldset>
                    <legend>Duration</legend>
                    <button type="button" className={draftOptions.duration === 'short' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, duration: 'short' }))}>Under 4 minutes</button>
                    <button type="button" className={draftOptions.duration === 'medium' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, duration: 'medium' }))}>4–20 minutes</button>
                    <button type="button" className={draftOptions.duration === 'long' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, duration: 'long' }))}>Over 20 minutes</button>
                    <button type="button" className={draftOptions.duration === 'any' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, duration: 'any' }))}>Any duration</button>
                  </fieldset>
                  <fieldset>
                    <legend>Upload date</legend>
                    {([
                      ['today', 'Today'],
                      ['week', 'This week'],
                      ['month', 'This month'],
                      ['year', 'This year'],
                      ['any', 'Any time'],
                    ] as Array<[SearchOptions['uploadDate'], string]>).map(([value, label]) => (
                      <button key={value} type="button" className={draftOptions.uploadDate === value ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, uploadDate: value }))}>{label}</button>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend>Features</legend>
                    <button type="button" className={draftOptions.filter === 'live' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, filter: 'live' }))}>Live</button>
                    <p>Only currently live broadcasts are included.</p>
                  </fieldset>
                  <fieldset>
                    <legend>Prioritize</legend>
                    <button type="button" className={draftOptions.order === 'relevance' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, order: 'relevance' }))}>Relevance</button>
                    <button type="button" className={draftOptions.order === 'viewCount' ? 'selected' : ''} onClick={() => setDraftOptions(current => ({ ...current, order: 'viewCount' }))}>Popularity</button>
                  </fieldset>
                </div>
                <footer><button type="button" className="yt-button yt-button-quiet" onClick={() => setDraftOptions(DEFAULT_OPTIONS)}>Reset</button><button type="button" className="yt-button yt-button-primary" onClick={applyFilters}>Apply filters</button></footer>
              </section>
            </div>
          )}
        </>
      )}

      {error && <div className="yt-notice" role="alert"><div><b>{error.message}</b>{needsLogin && <p><Link to="/login">Sign in</Link> to search channels.</p>}</div></div>}
      {loading && <div className="yt-loading" role="status">Searching YouTube {mode}…</div>}

      {!loading && searched && !error && mode === 'videos' && visibleVideos.length === 0 && (
        <div className="yt-empty"><Search size={26} /><h3>No videos found</h3><p>Try a broader search or adjust the filters.</p></div>
      )}
      {!loading && searched && !error && mode === 'channels' && channels.length === 0 && (
        <div className="yt-empty"><Search size={26} /><h3>No channels found</h3><p>Try a different creator name or topic.</p></div>
      )}

      {!loading && visibleVideos.length > 0 && mode === 'videos' && (
        <div className="yt-results yt-video-search-results">
          <div className="yt-section-heading"><div><h2>Video results</h2><p>{totalResults !== null ? totalResults.toLocaleString() + ' results' : visibleVideos.length + ' videos loaded'}</p></div></div>
          <div className="yt-search-video-list">
            {visibleVideos.map(video => (
              <YouTubeVideoCard key={video.videoId} video={video} relatedVideos={relatedVideos} layout="list" />
            ))}
          </div>
          {nextPageToken && <div className="yt-scroll-sentinel"><button type="button" className="yt-button yt-button-quiet" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading more…' : 'Load more videos'}</button></div>}
        </div>
      )}

      {!loading && channels.length > 0 && mode === 'channels' && (
        <div className="yt-results">
          <div className="yt-section-heading"><div><h2>Channel results</h2><p>{channels.length} channels found</p></div></div>
          {channels.map(channel => (
            <article className="yt-result-card" key={channel.channelId}>
              <a href={channel.url} target="_blank" rel="noopener noreferrer" className="yt-result-avatar" aria-label={'Open ' + channel.title + ' on YouTube'}>
                {channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" loading="lazy" /> : <Youtube size={26} />}
              </a>
              <div className="yt-result-copy"><h3><a href={channel.url} target="_blank" rel="noopener noreferrer">{channel.title} <ArrowUpRight size={13} /></a></h3><p>{channel.description || 'YouTube channel'}</p></div>
              <a className="yt-button yt-button-quiet yt-open-channel" href={channel.url} target="_blank" rel="noopener noreferrer">Open channel <ArrowUpRight size={14} /></a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
