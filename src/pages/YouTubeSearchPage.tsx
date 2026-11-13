import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';
import { ArrowUpRight, Check, Plus, Search, Youtube } from 'lucide-react';

type SearchMode = 'videos' | 'channels';
type ChannelResult = { channelId: string; title: string; description: string; thumbnailUrl: string | null; url: string; isAdded: boolean };
type VideoResult = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  url: string;
};
type SearchError = { code: string; message: string };

export default function YouTubeSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestId = useRef(0);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('videos');
  const [order, setOrder] = useState('relevance');
  const [duration, setDuration] = useState('any');
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [channels, setChannels] = useState<ChannelResult[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const searchFor = useCallback(async (term: string, selectedMode: SearchMode, selectedOrder: string, selectedDuration: string, pageToken?: string, append = false) => {
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
    setNotice(null);
    setSearched(true);
    try {
      let endpoint: string;
      if (selectedMode === 'channels') {
        endpoint = '/api/v1/youtube/channels/search?q=' + encodeURIComponent(term);
      } else {
        const params = new URLSearchParams({ q: term, order: selectedOrder, duration: selectedDuration });
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
    const selectedOrder = ['relevance', 'date', 'viewCount', 'rating'].includes(params.get('order') ?? '') ? params.get('order')! : 'relevance';
    const selectedDuration = ['any', 'short', 'medium', 'long'].includes(params.get('duration') ?? '') ? params.get('duration')! : 'any';
    setQuery(term);
    setMode(selectedMode);
    setOrder(selectedOrder);
    setDuration(selectedDuration);
    if (term.length >= 2) void searchFor(term, selectedMode, selectedOrder, selectedDuration);
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

  const openSearch = (term: string, selectedMode = mode, selectedOrder = order, selectedDuration = duration) => {
    const clean = term.trim().slice(0, 80);
    if (clean.length < 2) return;
    const params = new URLSearchParams({ q: clean, type: selectedMode });
    if (selectedMode === 'videos') {
      params.set('order', selectedOrder);
      params.set('duration', selectedDuration);
    }
    navigate('/youtube/search?' + params.toString());
  };

  const addChannel = async (channel: ChannelResult) => {
    setAdding(channel.channelId);
    setNotice(null);
    try {
      const response = await fetch('/api/v1/youtube/channels', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.channelId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not add this channel.');
      setChannels(items => items.map(item => item.channelId === channel.channelId ? { ...item, isAdded: true } : item));
      setNotice(channel.title + ' was added to your feed.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not add this channel.');
    } finally {
      setAdding(null);
    }
  };

  const loadMore = () => {
    if (!nextPageToken || loadingMore || loading) return;
    void searchFor(query, 'videos', order, duration, nextPageToken, true);
  };

  const needsLogin = error?.code === 'AUTH_REQUIRED';
  const relatedVideos: YouTubeCardVideo[] = videos;

  return (
    <section className="yt-page">
      <header className="yt-page-heading">
        <div>
          <span className="yt-eyebrow">YOUTUBE SEARCH</span>
          <h1>{query ? `Results for “${query}”` : 'Search YouTube'}</h1>
          <p>{query ? 'Videos and channels matching your search.' : 'Search for a video, topic or creator from the bar above.'}</p>
        </div>
      </header>

      <div className="yt-search-modes" role="tablist" aria-label="YouTube search type">
        <button type="button" role="tab" aria-selected={mode === 'videos'} className={mode === 'videos' ? 'active' : ''} onClick={() => openSearch(query, 'videos')}>Videos</button>
        <button type="button" role="tab" aria-selected={mode === 'channels'} className={mode === 'channels' ? 'active' : ''} onClick={() => openSearch(query, 'channels')}>Channels</button>
      </div>

      {mode === 'videos' && (
        <div className="yt-search-filters">
          <label>Sort by
            <select value={order} onChange={event => openSearch(query, 'videos', event.target.value, duration)} disabled={!query.trim()}>
              <option value="relevance">Relevance</option>
              <option value="date">Upload date</option>
              <option value="viewCount">View count</option>
              <option value="rating">Rating</option>
            </select>
          </label>
          <label>Duration
            <select value={duration} onChange={event => openSearch(query, 'videos', order, event.target.value)} disabled={!query.trim()}>
              <option value="any">Any length</option>
              <option value="short">Under 4 minutes</option>
              <option value="medium">4–20 minutes</option>
              <option value="long">Over 20 minutes</option>
            </select>
          </label>
        </div>
      )}

      {error && <div className="yt-notice" role="alert"><div><b>{error.message}</b>
        {needsLogin && <p><Link to="/login">Sign in</Link> to search and save channels.</p>}
        {!needsLogin && <p>Check your connection and try again.</p>}
      </div></div>}
      {notice && <div className="yt-notice" role="status">{notice}</div>}

      {loading && <div className="yt-loading" role="status">Searching YouTube {mode}…</div>}

      {!loading && searched && !error && mode === 'videos' && videos.length === 0 && (
        <div className="yt-empty"><Search size={26} /><h3>No videos found</h3><p>Try a broader search or choose a different sort or duration.</p></div>
      )}
      {!loading && searched && !error && mode === 'channels' && channels.length === 0 && (
        <div className="yt-empty"><Search size={26} /><h3>No channels found</h3><p>Try a different channel name or topic.</p></div>
      )}

      {!loading && videos.length > 0 && mode === 'videos' && (
        <div className="yt-results yt-video-search-results">
          <div className="yt-section-heading"><div><h2>Video results</h2><p>{totalResults !== null ? totalResults.toLocaleString() + ' results' : videos.length + ' videos loaded'}</p></div></div>
          <div className="yt-search-video-list">
            {videos.map(video => (
              <YouTubeVideoCard key={video.videoId} video={video} relatedVideos={relatedVideos} layout="list" />
            ))}
          </div>
          {nextPageToken && <div className="yt-scroll-sentinel">
            <button type="button" className="yt-button yt-button-quiet" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading more…' : 'Load more videos'}</button>
          </div>}
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
              <button type="button" className={'yt-button ' + (channel.isAdded ? 'yt-button-added' : 'yt-button-primary')} disabled={channel.isAdded || adding === channel.channelId} onClick={() => void addChannel(channel)}>
                {channel.isAdded ? <><Check size={15} /> Added</> : adding === channel.channelId ? 'Adding…' : <><Plus size={15} /> Add to feed</>}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
