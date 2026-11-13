import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Bookmark, BookmarkCheck, ExternalLink, History, Youtube } from 'lucide-react';
import { ApiError } from '../lib/api';
import YouTubeIframePlayer from '../components/YouTubeIframePlayer';

type VideoDetails = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  embeddable: boolean;
  url: string;
};
type StoredHistory = { videoId: string; progressSeconds: number; durationSeconds: number | null };

function progressKey(accountId: string | null, videoId: string): string {
  return 'kairo-youtube-progress:' + (accountId ?? 'guest') + ':' + videoId;
}

async function responsePayload(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

export default function YouTubeWatchPage() {
  const { videoId = '' } = useParams();
  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountResolved, setAccountResolved] = useState(false);
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
      setAccountResolved(false);
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
        let history: StoredHistory | null = null;
        let saved = false;
        if (userId) {
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
        try { localProgress = Number(localStorage.getItem(progressKey(userId, videoId)) ?? 0); } catch { /* storage may be disabled */ }
        const resume = history && Number.isFinite(history.progressSeconds) ? history.progressSeconds : localProgress;
        if (active) {
          setVideo(videoPayload.data as VideoDetails);
          setAccountId(userId);
          setStartSeconds(Number.isFinite(resume) && resume > 0 ? resume : 0);
          setIsSaved(saved);
          setAccountResolved(true);
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
    if (!video || !Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return;
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
    if (!video || !accountId || saving) return;
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
            {!video.embeddable ? (
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
                onProgress={onProgress}
              />
            )}
          </section>
          <div className="kc-player-toolbar">
            <div className="kc-player-toolbar-left"><span className="kc-live-dot" /> <span>YouTube player</span><span className="kc-toolbar-divider" /><span>{video.durationSeconds ? Math.floor(video.durationSeconds / 60) + ' min' : 'Video'}</span></div>
            <div className="kc-player-toolbar-actions">
              {accountId ? (
                <button type="button" className={'kc-player-tool' + (isSaved ? ' is-on' : '')} onClick={() => void saveToWatchLater()} disabled={isSaved || saving} aria-pressed={isSaved}>
                  {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}{isSaved ? 'Saved' : saving ? 'Saving…' : 'Watch later'}
                </button>
              ) : <Link className="kc-player-tool" to="/login"><Bookmark size={14} /> Sign in to save</Link>}
              <a className="kc-player-tool" href={video.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Watch on YouTube</a>
            </div>
          </div>
          <div className="kc-watch-bar yt-video-heading">
            <div>
              <h1>{video.title}</h1>
              <p>{video.channelTitle}{video.publishedAt ? ' · ' + new Date(video.publishedAt).toLocaleDateString() : ''}</p>
            </div>
          </div>
          {error && <div className="yt-notice" role="alert">{error}</div>}
          {video.description && <div className="kc-watch-about yt-video-description"><p>{video.description}</p></div>}
        </div>
        <aside className="kc-queue yt-watch-sidebar" aria-label="Video details">
          <div className="kc-queue-head"><div><span className="kc-section-kicker">NOW PLAYING</span><h2>Video details</h2></div><Youtube size={18} /></div>
          {video.thumbnailUrl && <img className="yt-watch-sidebar-art" src={video.thumbnailUrl} alt="" />}
          <div className="yt-watch-sidebar-copy">
            <b>{video.channelTitle}</b>
            <p>{video.publishedAt ? 'Published ' + new Date(video.publishedAt).toLocaleDateString() : 'YouTube video'}</p>
            {accountId && <Link to="/youtube/history"><History size={14} /> Your watch history</Link>}
            <Link to="/youtube/watch-later"><Bookmark size={14} /> Watch Later</Link>
            <a href={video.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open on YouTube</a>
          </div>
        </aside>
      </div>
    </section>
  );
}
