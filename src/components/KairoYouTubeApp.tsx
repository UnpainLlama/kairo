import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, Play, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useAccount } from '../lib/AccountProvider';
import { deleteMediaPlayback, loadMediaPlayback, syncMediaPlayback, writeLocalMediaPlayback, type SavedPlayerState } from '../lib/mediaPlayback';
import type { PlaybackSaveReason } from '../lib/playbackSync';
import { shouldSyncPlaybackProgress } from '../lib/playbackSync';
import YouTubeIframePlayer from './YouTubeIframePlayer';

type YouTubeVideo = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  thumbnail?: string | null;
  channelId: string;
  channelTitle: string;
  channelAvatarUrl?: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  url?: string;
};
type YouTubeChannel = {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  url?: string;
  isAdded?: boolean;
  addedAt?: string;
};
type YouTubeVideoDetails = YouTubeVideo & {
  embeddable: boolean | null;
  madeForKids: boolean;
  url: string;
};
type ApiEnvelope<T> = { success: boolean; data: T; error?: { code?: string; message?: string } };

async function youtubeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message ?? 'YouTube is temporarily unavailable.');
  }
  return payload.data;
}

function normalizeVideo(video: YouTubeVideo): YouTubeVideo {
  return { ...video, thumbnailUrl: video.thumbnailUrl ?? video.thumbnail ?? null };
}

function formatPublished(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function YouTubeVideoCard({ video }: { video: YouTubeVideo }) {
  const thumbnail = video.thumbnailUrl ?? video.thumbnail ?? null;
  return (
    <Link className="youtube-video-card" to={'/youtube/watch/' + encodeURIComponent(video.videoId)}>
      <span className="youtube-video-art">
        {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <span className="youtube-video-fallback"><Play size={25} /></span>}
      </span>
      <span className="youtube-video-copy">
        <strong>{video.title}</strong>
        <small>{video.channelTitle}{formatPublished(video.publishedAt) ? ' · ' + formatPublished(video.publishedAt) : ''}</small>
      </span>
    </Link>
  );
}

function YouTubePanel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="youtube-panel"><header><h2>{title}</h2>{action}</header>{children}</section>;
}

function YouTubeHomePage() {
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(''); setVideos([]); setCursor(null); setSelectedChannel('all');
    try {
      const [channelData, feedData] = await Promise.all([
        youtubeRequest<{ channels: YouTubeChannel[] }>('/api/v1/youtube/channels'),
        youtubeRequest<{ videos: YouTubeVideo[]; nextCursor: string | null }>('/api/v1/youtube/feed'),
      ]);
      setChannels(channelData.channels ?? []);
      setVideos((feedData.videos ?? []).map(normalizeVideo));
      setCursor(feedData.nextCursor ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your YouTube feed.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true); setError('');
    try {
      const data = await youtubeRequest<{ videos: YouTubeVideo[]; nextCursor: string | null }>('/api/v1/youtube/feed?cursor=' + encodeURIComponent(cursor));
      const next = (data.videos ?? []).map(normalizeVideo);
      setVideos(current => {
        const seen = new Set(current.map(video => video.videoId));
        return [...current, ...next.filter(video => !seen.has(video.videoId))];
      });
      setCursor(data.nextCursor ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load more videos.');
    } finally { setLoadingMore(false); }
  };

  const visible = selectedChannel === 'all' ? videos : videos.filter(video => video.channelId === selectedChannel);
  const selectedTitle = channels.find(channel => channel.channelId === selectedChannel)?.title;
  return (
    <section className="youtube-page">
      <header className="youtube-page-heading">
        <div><span className="youtube-eyebrow">KAIRO VIDEO</span><h1>Home</h1><p>Recent uploads from the channels you follow.</p></div>
        <div className="youtube-page-actions">
          <Link className="youtube-button youtube-button-primary" to="/youtube/search"><Search size={15} /> Search videos</Link>
          <button className="youtube-button" type="button" onClick={() => void load()} disabled={loading || loadingMore}><RefreshCw size={15} /> Refresh</button>
        </div>
      </header>
      <nav className="youtube-topic-chips" aria-label="YouTube topics">
        <button className={selectedChannel === 'all' ? 'active' : ''} onClick={() => setSelectedChannel('all')} type="button">All</button>
        {channels.map(channel => <button key={channel.channelId} className={selectedChannel === channel.channelId ? 'active' : ''} onClick={() => setSelectedChannel(channel.channelId)} type="button">{channel.title}</button>)}
      </nav>
      {error && <div className="youtube-notice" role="alert">{error}</div>}
      {loading && <div className="youtube-empty" role="status">Loading your feed…</div>}
      {!loading && channels.length === 0 && <div className="youtube-empty"><Play size={28} /><h2>Your feed starts with channels</h2><p>Search for creators and add their channels to build your feed.</p><Link className="youtube-button youtube-button-primary" to="/youtube/search?type=channels">Find channels</Link></div>}
      {!loading && channels.length > 0 && visible.length === 0 && <div className="youtube-empty"><h2>{selectedTitle ? 'No recent uploads' : 'No recent uploads yet'}</h2><p>Try another channel or refresh later.</p></div>}
      {visible.length > 0 && <div className="youtube-video-grid">{visible.map(video => <YouTubeVideoCard key={video.videoId} video={video} />)}</div>}
      {!loading && cursor && <div className="youtube-load-more"><button className="youtube-button" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more videos'}</button></div>}
      <YouTubePanel title="Subscriptions" action={<Link to="/youtube/channels">Manage channels</Link>}>
        {channels.length
          ? <div className="youtube-channel-grid">{channels.map(channel => <Link className="youtube-channel-card" to={'/youtube/search?q=' + encodeURIComponent(channel.title)} key={channel.channelId}>
              {channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span>{channel.title.slice(0, 1).toUpperCase()}</span>}
              <strong>{channel.title}</strong>
            </Link>)}</div>
          : <p className="youtube-panel-empty">No channels saved yet.</p>}
      </YouTubePanel>
    </section>
  );
}

function YouTubeSearchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialQuery = params.get('q') ?? '';
  const initialMode = params.get('type') === 'channels' ? 'channels' : 'videos';
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<'videos' | 'channels'>(initialMode);
  const [order, setOrder] = useState(params.get('order') ?? 'relevance');
  const [duration, setDuration] = useState(params.get('duration') ?? 'any');
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  const search = useCallback(async (term: string, selectedMode: 'videos' | 'channels', selectedOrder: string, selectedDuration: string) => {
    if (term.trim().length < 2) { setError('Enter at least two characters to search.'); return; }
    setLoading(true); setError(''); setNotice(''); setVideos([]); setChannels([]); setPageToken(null);
    try {
      if (selectedMode === 'channels') {
        const data = await youtubeRequest<{ channels: YouTubeChannel[] }>('/api/v1/youtube/channels/search?q=' + encodeURIComponent(term.trim()));
        setChannels(data.channels ?? []);
      } else {
        const queryParams = new URLSearchParams({ q: term.trim(), order: selectedOrder, duration: selectedDuration });
        const data = await youtubeRequest<{ videos: YouTubeVideo[]; nextPageToken: string | null }>('/api/v1/youtube/videos/search?' + queryParams.toString());
        setVideos((data.videos ?? []).map(normalizeVideo));
        setPageToken(data.nextPageToken ?? null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'YouTube search failed.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const term = params.get('q') ?? '';
    const selectedMode = params.get('type') === 'channels' ? 'channels' : 'videos';
    const selectedOrder = params.get('order') ?? 'relevance';
    const selectedDuration = params.get('duration') ?? 'any';
    setQuery(term); setMode(selectedMode); setOrder(selectedOrder); setDuration(selectedDuration);
    if (term.trim().length >= 2) void search(term, selectedMode, selectedOrder, selectedDuration);
  }, [params, search]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = query.trim().slice(0, 80);
    if (clean.length < 2) return;
    const next = new URLSearchParams({ q: clean, type: mode });
    if (mode === 'videos') { next.set('order', order); next.set('duration', duration); }
    navigate('/youtube/search?' + next.toString());
  };

  const loadMore = async () => {
    if (!pageToken || loadingMore || loading || mode !== 'videos') return;
    setLoadingMore(true); setError('');
    try {
      const queryParams = new URLSearchParams({ q: query.trim(), order, duration, pageToken });
      const data = await youtubeRequest<{ videos: YouTubeVideo[]; nextPageToken: string | null }>('/api/v1/youtube/videos/search?' + queryParams.toString());
      const next = (data.videos ?? []).map(normalizeVideo);
      setVideos(current => {
        const seen = new Set(current.map(video => video.videoId));
        return [...current, ...next.filter(video => !seen.has(video.videoId))];
      });
      setPageToken(data.nextPageToken ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load more videos.');
    } finally { setLoadingMore(false); }
  };

  const addChannel = async (channel: YouTubeChannel) => {
    setAdding(channel.channelId); setError('');
    try {
      await youtubeRequest('/api/v1/youtube/channels', { method: 'POST', body: JSON.stringify({ channelId: channel.channelId }) });
      setChannels(current => current.map(item => item.channelId === channel.channelId ? { ...item, isAdded: true } : item));
      setNotice(channel.title + ' was added to your subscriptions.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add that channel.'); }
    finally { setAdding(null); }
  };

  return (
    <section className="youtube-page">
      <header className="youtube-page-heading"><div><span className="youtube-eyebrow">DISCOVER</span><h1>Search YouTube</h1><p>Find public videos and channels.</p></div></header>
      <form className="youtube-search-form" onSubmit={submit}>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search videos or channels…" aria-label="Search YouTube" maxLength={80} />
        <button className="youtube-button youtube-button-primary" type="submit" disabled={loading}><Search size={15} /> Search</button>
      </form>
      <div className="youtube-search-tabs" role="tablist" aria-label="Search type">
        <button className={mode === 'videos' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'videos'} onClick={() => {
          setMode('videos');
          if (query.trim().length >= 2) {
            const next = new URLSearchParams({ q: query.trim(), type: 'videos', order, duration });
            navigate('/youtube/search?' + next.toString());
          }
        }}>Videos</button>
        <button className={mode === 'channels' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'channels'} onClick={() => {
          setMode('channels');
          if (query.trim().length >= 2) navigate('/youtube/search?' + new URLSearchParams({ q: query.trim(), type: 'channels' }).toString());
        }}>Channels</button>
      </div>
      {mode === 'videos' && <div className="youtube-search-filters">
        <label>Sort by<select value={order} onChange={event => setOrder(event.target.value)}><option value="relevance">Relevance</option><option value="date">Upload date</option><option value="viewCount">View count</option><option value="rating">Rating</option></select></label>
        <label>Duration<select value={duration} onChange={event => setDuration(event.target.value)}><option value="any">Any length</option><option value="short">Under 4 minutes</option><option value="medium">4–20 minutes</option><option value="long">Over 20 minutes</option></select></label>
      </div>}
      {error && <div className="youtube-notice" role="alert">{error}</div>}
      {notice && <div className="youtube-notice" role="status">{notice}</div>}
      {loading && <div className="youtube-empty" role="status">Searching…</div>}
      {!loading && mode === 'videos' && videos.length > 0 && <div className="youtube-video-grid">{videos.map(video => <YouTubeVideoCard key={video.videoId} video={video} />)}</div>}
      {!loading && mode === 'channels' && channels.length > 0 && <div className="youtube-search-channel-grid">
        {channels.map(channel => <article className="youtube-channel-result" key={channel.channelId}>
          {channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span className="youtube-channel-placeholder">{channel.title.slice(0, 1)}</span>}
          <div><strong>{channel.title}</strong><p>{channel.description}</p></div>
          <button className="youtube-button" type="button" onClick={() => void addChannel(channel)} disabled={Boolean(channel.isAdded) || adding === channel.channelId}>
            {channel.isAdded ? 'Added' : adding === channel.channelId ? 'Adding…' : <><Plus size={14} /> Add channel</>}
          </button>
        </article>)}
      </div>}
      {!loading && !error && query.trim().length >= 2 && videos.length === 0 && channels.length === 0 && <div className="youtube-empty">No results found.</div>}
      {!loading && !error && !params.get('q') && <div className="youtube-empty">Search for a video, topic or creator.</div>}
      {pageToken && !loading && mode === 'videos' && <div className="youtube-load-more"><button className="youtube-button" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more results'}</button></div>}
    </section>
  );
}

function YouTubeChannelsPage() {
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await youtubeRequest<{ channels: YouTubeChannel[] }>('/api/v1/youtube/channels'); setChannels(data.channels ?? []); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load channels.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const remove = async (channelId: string) => {
    setRemoving(channelId); setError('');
    try { await youtubeRequest('/api/v1/youtube/channels/' + encodeURIComponent(channelId), { method: 'DELETE' }); setChannels(current => current.filter(channel => channel.channelId !== channelId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove channel.'); }
    finally { setRemoving(null); }
  };
  return (
    <section className="youtube-page">
      <header className="youtube-page-heading"><div><span className="youtube-eyebrow">YOUR CHANNELS</span><h1>Subscriptions</h1><p>Manage the channels included in your feed.</p></div><Link className="youtube-button youtube-button-primary" to="/youtube/search?type=channels"><Plus size={15} /> Add channels</Link></header>
      {error && <div className="youtube-notice" role="alert">{error}</div>}
      {loading && <div className="youtube-empty" role="status">Loading channels…</div>}
      {!loading && channels.length === 0 && <div className="youtube-empty"><h2>No channels saved</h2><p>Search for channels to build your feed.</p><Link to="/youtube/search?type=channels" className="youtube-button youtube-button-primary">Find channels</Link></div>}
      <div className="youtube-search-channel-grid">{channels.map(channel => <article className="youtube-channel-result" key={channel.channelId}>
        {channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span className="youtube-channel-placeholder">{channel.title.slice(0, 1)}</span>}
        <div><strong>{channel.title}</strong><p>{channel.description}</p></div>
        <button className="youtube-button" type="button" onClick={() => void remove(channel.channelId)} disabled={removing === channel.channelId}>{removing === channel.channelId ? 'Removing…' : <><Trash2 size={14} /> Remove</>}</button>
      </article>)}</div>
    </section>
  );
}

function YouTubeLibraryPage({ kind }: { kind: 'history' | 'watch-later' }) {
  const account = useAccount();
  const [items, setItems] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const base = kind === 'history' ? '/api/v1/youtube/history' : '/api/v1/youtube/watch-later';
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await youtubeRequest<{ items: YouTubeVideo[] }>(base); setItems((data.items ?? []).map(normalizeVideo)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load videos.'); }
    finally { setLoading(false); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);
  const remove = async (videoId: string) => {
    setRemoving(videoId); setError('');
    try {
      await youtubeRequest(base + '/' + encodeURIComponent(videoId), { method: 'DELETE' });
      if (kind === 'history') await deleteMediaPlayback(account.user?.id ?? null, 'youtube', videoId);
      setItems(current => current.filter(video => video.videoId !== videoId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove video.'); }
    finally { setRemoving(null); }
  };
  const title = kind === 'history' ? 'Watch history' : 'Watch Later';
  return (
    <section className="youtube-page">
      <header className="youtube-page-heading"><div><span className="youtube-eyebrow">YOUR LIBRARY</span><h1>{title}</h1><p>{kind === 'history' ? 'Continue where you left off.' : 'Videos saved for later.'}</p></div></header>
      {error && <div className="youtube-notice" role="alert">{error}</div>}
      {loading && <div className="youtube-empty" role="status">Loading videos…</div>}
      {!loading && items.length === 0 && <div className="youtube-empty">No videos here yet.</div>}
      {items.length > 0 && <div className="youtube-video-grid">{items.map(video => <div className="youtube-library-card" key={video.videoId}>
        <YouTubeVideoCard video={video} />
        <button className="youtube-remove-button" type="button" onClick={() => void remove(video.videoId)} disabled={removing === video.videoId}>{removing === video.videoId ? 'Removing…' : <><Trash2 size={13} /> Remove</>}</button>
      </div>)}</div>}
    </section>
  );
}

function YouTubeWatchPage() {
  const { videoId = '' } = useParams();
  const account = useAccount();
  const [video, setVideo] = useState<YouTubeVideoDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [startSeconds, setStartSeconds] = useState(0);
  const [initialPlayerState, setInitialPlayerState] = useState<SavedPlayerState | null>(null);
  const [saved, setSaved] = useState(false);
  const lastSyncedAt = useRef(0);
  const lastSyncedSeconds = useRef(0);
  const lastPlayerState = useRef('');
  const userId = account.user?.id ?? null;

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true); setError(''); setVideo(null);
      try {
        const [details, playback, savedItems] = await Promise.all([
          youtubeRequest<YouTubeVideoDetails>('/api/v1/youtube/videos/' + encodeURIComponent(videoId)),
          loadMediaPlayback(userId, 'youtube', videoId),
          youtubeRequest<{ items: YouTubeVideo[] }>('/api/v1/youtube/watch-later'),
        ]);
        if (!active) return;
        const normalized = normalizeVideo(details) as YouTubeVideoDetails;
        setVideo(normalized);
        setStartSeconds(normalized.madeForKids ? 0 : playback?.progressSeconds ?? 0);
        setInitialPlayerState(normalized.madeForKids ? null : playback?.playerState ?? null);
        setSaved((savedItems.items ?? []).some(item => item.videoId === videoId));
        lastSyncedAt.current = playback?.updatedAt ?? 0;
        lastSyncedSeconds.current = playback?.progressSeconds ?? 0;
        lastPlayerState.current = JSON.stringify(playback?.playerState ?? {});
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'This YouTube video could not be loaded.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [videoId, userId]);

  const onProgress = useCallback((seconds: number, duration: number, completed: boolean, reason: PlaybackSaveReason, playerState: SavedPlayerState = {}) => {
    const current = video;
    if (!current || !userId || current.madeForKids) return;
    const now = Date.now();
    const stateKey = JSON.stringify(playerState);
    const snapshot = {
      mediaType: 'youtube' as const,
      mediaKey: current.videoId,
      title: current.title,
      artworkUrl: current.thumbnailUrl,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : current.durationSeconds,
      progressSeconds: Math.max(0, seconds),
      completed,
      playerState,
      updatedAt: now,
    };
    writeLocalMediaPlayback(userId, snapshot);
    const stateChanged = stateKey !== lastPlayerState.current;
    if (!shouldSyncPlaybackProgress(reason, lastSyncedAt.current, lastSyncedSeconds.current, seconds, now, stateChanged)) return;
    lastSyncedAt.current = now;
    lastSyncedSeconds.current = seconds;
    lastPlayerState.current = stateKey;
    void Promise.all([
      syncMediaPlayback(userId, snapshot),
      youtubeRequest('/api/v1/youtube/history', { method: 'POST', body: JSON.stringify({
        videoId: current.videoId, title: current.title, description: current.description,
        thumbnailUrl: current.thumbnailUrl, channelId: current.channelId, channelTitle: current.channelTitle,
        publishedAt: current.publishedAt, durationSeconds: snapshot.durationSeconds,
        progressSeconds: snapshot.progressSeconds, completed,
      }) }),
    ]).catch(caught => setNotice(caught instanceof Error ? caught.message : 'Playback progress could not be saved.'));
  }, [userId, video]);

  const toggleWatchLater = async () => {
    if (!video || video.madeForKids) return;
    setNotice('');
    try {
      if (saved) await youtubeRequest('/api/v1/youtube/watch-later/' + encodeURIComponent(video.videoId), { method: 'DELETE' });
      else await youtubeRequest('/api/v1/youtube/watch-later', { method: 'POST', body: JSON.stringify({
        videoId: video.videoId, title: video.title, description: video.description, thumbnailUrl: video.thumbnailUrl,
        channelId: video.channelId, channelTitle: video.channelTitle, publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
      }) });
      setSaved(!saved);
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Could not update Watch Later.'); }
  };

  return (
    <section className="youtube-page youtube-watch-page">
      <Link to="/youtube" className="youtube-back-link"><ArrowLeft size={15} /> Back to YouTube</Link>
      {loading && <div className="youtube-empty" role="status">Loading video…</div>}
      {error && <div className="youtube-notice" role="alert">{error}</div>}
      {video && <>
        <div className="youtube-watch-layout">
          <div className="youtube-watch-main">
            {video.embeddable === false
              ? <div className="youtube-embed-unavailable"><h2>This video cannot be embedded</h2><a className="youtube-button youtube-button-primary" href={video.url} target="_blank" rel="noreferrer">Watch on YouTube <ExternalLink size={14} /></a></div>
              : <YouTubeIframePlayer videoId={video.videoId} title={video.title} startSeconds={startSeconds} initialPlayerState={initialPlayerState} onProgress={onProgress} />}
            <h1>{video.title}</h1>
            <p className="youtube-watch-channel">{video.channelTitle}{formatPublished(video.publishedAt) ? ' · ' + formatPublished(video.publishedAt) : ''}</p>
            <p className="youtube-watch-description">{video.description}</p>
            {notice && <div className="youtube-notice" role="status">{notice}</div>}
          </div>
          <aside className="youtube-watch-aside">
            <button className="youtube-button" type="button" onClick={() => void toggleWatchLater()} disabled={video.madeForKids}>
              {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}{saved ? 'Saved to Watch Later' : 'Save to Watch Later'}
            </button>
            <a className="youtube-button" href={video.url} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={14} /></a>
            {video.madeForKids && <p className="youtube-panel-empty">YouTube has marked this video as made for kids, so Kairo does not save viewing activity for it.</p>}
          </aside>
        </div>
      </>}
    </section>
  );
}

export default function KairoYouTubeApp() {
  const account = useAccount();
  if (account.status === 'loading') return <div className="youtube-empty">Checking admin access…</div>;
  if (account.user?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <Routes>
      <Route index element={<YouTubeHomePage />} />
      <Route path="search" element={<YouTubeSearchPage />} />
      <Route path="channels" element={<YouTubeChannelsPage />} />
      <Route path="watch/:videoId" element={<YouTubeWatchPage />} />
      <Route path="watch-later" element={<YouTubeLibraryPage kind="watch-later" />} />
      <Route path="history" element={<YouTubeLibraryPage kind="history" />} />
      <Route path="*" element={<Navigate to="/youtube" replace />} />
    </Routes>
  );
}
