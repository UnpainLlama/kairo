import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';
import { ArrowLeft, ArrowUpRight, Bookmark, BookmarkCheck, ExternalLink, History, Youtube } from 'lucide-react';
import YouTubeIframePlayer from '../components/YouTubeIframePlayer';

type VideoDetails = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  channelAvatarUrl?: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  embeddable: boolean | null;
  madeForKids: boolean;
  url: string;
};
type StoredHistory = { videoId: string; progressSeconds: number; durationSeconds: number | null };

function progressKey(accountId: string | null, videoId: string): string {
  return 'kairo-youtube-progress:' + (accountId ?? 'guest') + ':' + videoId;
}

async function responsePayload(response: Response): Promise<any> {
  return response.json().catch(() => null);
}


function relatedFromState(state: unknown, currentVideoId: string): YouTubeCardVideo[] {
  if (!state || typeof state !== 'object') return [];
  const raw = (state as { youtubeRelatedVideos?: unknown }).youtubeRelatedVideos;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is YouTubeCardVideo => {
    if (!item || typeof item !== 'object') return false;
    const video = item as Record<string, unknown>;
    return typeof video.videoId === 'string'
      && video.videoId !== currentVideoId
      && typeof video.title === 'string'
      && typeof video.channelTitle === 'string'
      && (video.channelAvatarUrl === undefined || video.channelAvatarUrl === null || typeof video.channelAvatarUrl === 'string')
      && (video.thumbnailUrl === null || typeof video.thumbnailUrl === 'string')
      && (video.publishedAt === null || typeof video.publishedAt === 'string')
      && (video.durationSeconds === undefined || video.durationSeconds === null || typeof video.durationSeconds === 'number');
  }).slice(0, 12);
}

export default function YouTubeWatchPage() {
  const { videoId = '' } = useParams();
  const location = useLocation();
  const relatedVideos = relatedFromState(location.state, videoId);
  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [startSeconds, setStartSeconds] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lastRemoteSave = useRef(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      setVideo(null);
      setStartSeconds(0);
      try {
        const [videoResponse, accountResponse] = await Promise.all([
          fetch('/api/v1/youtube/videos/' + encodeURIComponent(videoId), { headers: { Accept: 'application/json' } }),
          fetch('/api/v1/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
        ]);
        const videoPayload = await responsePayload(videoResponse);
        if (!videoResponse.ok || !videoPayload?.success || !videoPayload.data) {
          throw new Error(videoPayload?.error?.message ?? 'This YouTube video could not be found.');
        }
        const userPayload = accountResponse.ok ? await responsePayload(accountResponse) : null;
        const userId = typeof userPayload?.data?.user?.id === 'string' ? userPayload.data.user.id : null;
        const madeForKids = videoPayload.data.madeForKids === true;
        let history: StoredHistory | null = null;
        let saved = false;
        if (userId && !madeForKids) {
          const [historyResponse, laterResponse] = await Promise.all([
            fetch('/api/v1/youtube/history', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
            fetch('/api/v1/youtube/watch-later', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
          ]);
          const historyPayload = historyResponse.ok ? await responsePayload(historyResponse) : null;
          const laterPayload = laterResponse.ok ? await responsePayload(laterResponse) : null;
          history = (historyPayload?.data?.items ?? []).find((item: StoredHistory) => item.videoId === videoId) ?? null;
          saved = (laterPayload?.data?.items ?? []).some((item: { videoId: string }) => item.videoId === videoId);
        }
        let localProgress = 0;
        try { localProgress = madeForKids ? 0 : Number(localStorage.getItem(progressKey(userId, videoId)) ?? 0); } catch { /* storage may be disabled */ }
        const resume = history && Number.isFinite(history.progressSeconds) ? history.progressSeconds : localProgress;
        if (active) {
          const routeVideo = location.state && typeof location.state === 'object'
            ? (location.state as { youtubeCurrentVideo?: YouTubeCardVideo }).youtubeCurrentVideo
            : undefined;
          const details = videoPayload.data as VideoDetails;
          setVideo({
            ...details,
            channelAvatarUrl: details.channelAvatarUrl ?? routeVideo?.channelAvatarUrl ?? null,
          });
          setAccountId(userId);
          setStartSeconds(Number.isFinite(resume) && resume > 0 ? resume : 0);
          setIsSaved(saved);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load this YouTube video.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [videoId]);

  const onProgress = useCallback((seconds: number, duration: number, completed: boolean, reason: 'timeupdate' | 'pause' | 'ended' | 'pagehide') => {
    if (!video || video.madeForKids || !Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return;
    const position = completed ? duration : Math.max(0, Math.min(duration, seconds));
    const now = Date.now();
    try { localStorage.setItem(progressKey(accountId, video.videoId), String(position)); } catch { /* local storage may be disabled */ }
    if (!accountId) return;
    if (reason === 'timeupdate' && now - lastRemoteSave.current < 15000) return;
    lastRemoteSave.current = now;
    const body = {
      videoId: video.videoId,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      durationSeconds: duration,
      progressSeconds: position,
      completed,
    };
    void fetch('/api/v1/youtube/history', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: reason === 'pagehide' || reason === 'ended',
    }).catch(() => { /* local resume point remains available */ });
  }, [accountId, video]);

  const saveToWatchLater = async () => {
    if (!video || video.madeForKids || !accountId || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/v1/youtube/watch-later', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: video.videoId,
          title: video.title,
          description: video.description,
          thumbnailUrl: video.thumbnailUrl,
          channelId: video.channelId,
          channelTitle: video.channelTitle,
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds,
        }),
      });
      const payload = await responsePayload(response);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not save this video.');
      setIsSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this video.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="yt-watch-state" role="status">Loading video…</div>;
  if (error && !video) return <section className="yt-watch-state" role="alert"><h1>Video unavailable</h1><p>{error}</p><Link to="/youtube">Back to YouTube Home</Link></section>;
  if (!video) return null;

  return (
    <section className="kc-watch yt-watch">
      <div className="yt-watch-topline">
        <Link to="/youtube" className="kc-back-link"><ArrowLeft size={15} /> Back to YouTube</Link>
        <span className="kc-watch-breadcrumb">YouTube <span>/</span> {video.channelTitle}</span>
      </div>
      <div className="kc-watch-layout">
        <div className="kc-watch-main">
          <section className="kc-player yt-player-shell" aria-label="YouTube video player">
            {video.embeddable === false ? (
              <div className="kc-player-message">
                <span className="kc-player-icon"><Youtube size={24} /></span>
                <h2>This video cannot be embedded</h2>
                <p>The video owner or YouTube has disabled embedded playback. You can still watch it on YouTube.</p>
                <a className="yt-button yt-button-primary" href={video.url} target="_blank" rel="noopener noreferrer">Watch on YouTube <ArrowUpRight size={14} /></a>
              </div>
            ) : (
              <YouTubeIframePlayer
                key={video.videoId}
                videoId={video.videoId}
                title={video.title}
                startSeconds={startSeconds}
                onProgress={video.madeForKids ? undefined : onProgress}
              />
            )}
          </section>
          <div className="kc-player-toolbar">
            <div className="kc-player-toolbar-left"><span className="kc-live-dot" /> <span>YouTube player</span><span className="kc-toolbar-divider" /><span>{video.durationSeconds ? Math.floor(video.durationSeconds / 60) + ' min' : 'Video'}</span></div>
            <div className="kc-player-toolbar-actions">
              {video.madeForKids ? (
                <span className="kc-player-tool" role="note">History is off for this video</span>
              ) : accountId ? (
                <button type="button" className={'kc-player-tool' + (isSaved ? ' is-on' : '')} onClick={() => void saveToWatchLater()} disabled={isSaved || saving} aria-pressed={isSaved}>
                  {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}{isSaved ? 'Saved' : saving ? 'Saving…' : 'Watch later'}
                </button>
              ) : <Link className="kc-player-tool" to="/login"><Bookmark size={14} /> Sign in to save</Link>}
              <a className="kc-player-tool" href={video.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Watch on YouTube</a>
            </div>
          </div>
          <div className="kc-watch-bar yt-video-heading">
            <span className="yt-watch-channel-avatar">
              {video.channelAvatarUrl
                ? <img src={video.channelAvatarUrl} alt="" loading="lazy" />
                : (video.channelTitle.trim().slice(0, 1).toUpperCase() || 'Y')}
            </span>
            <div className="yt-watch-channel-copy">
              <h1>{video.title}</h1>
              <p>{video.channelTitle}{video.publishedAt ? ' · ' + new Date(video.publishedAt).toLocaleDateString() : ''}</p>
            </div>
          </div>
          {video.madeForKids && <div className="yt-notice" role="note">YouTube marks this video as Made for Kids, so Kairo does not save watch history or playback progress for it.</div>}
          {error && <div className="yt-notice" role="alert">{error}</div>}
          {video.description && <div className="kc-watch-about yt-video-description"><p>{video.description}</p></div>}
        </div>
        <aside className="kc-queue yt-watch-sidebar yt-up-next" aria-label="Up next">
          <div className="kc-queue-head">
            <div><span className="kc-section-kicker">UP NEXT</span><h2>Recommended videos</h2></div>
            <Youtube size={18} />
          </div>
          {relatedVideos.length > 0 ? (
            <div className="yt-recommended-list">
              {relatedVideos.map(item => <YouTubeVideoCard key={item.videoId} video={item} relatedVideos={relatedVideos} compact />)}
            </div>
          ) : (
            <div className="yt-recommendations-empty">
              <p>Open a video from Home or Search to keep its related videos in this watch queue.</p>
              <Link to="/youtube/search">Find more videos <ExternalLink size={13} /></Link>
            </div>
          )}
          <div className="yt-watch-sidebar-footer">
            {!video.madeForKids && accountId && <Link to="/youtube/history"><History size={14} /> Watch history</Link>}
            {!video.madeForKids && <Link to="/youtube/watch-later"><Bookmark size={14} /> Watch Later</Link>}
            <a href={video.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open on YouTube</a>
          </div>
        </aside>
      </div>
    </section>
  );
}
