import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, History, Youtube } from 'lucide-react';
import YouTubeIframePlayer from '../components/YouTubeIframePlayer';
import { useAccountScope } from '../hooks/useAccountScope';
import { addGuestYouTubeWatchLater, saveGuestYouTubeProgress, readGuestYouTubeHistory, readGuestYouTubeWatchLater } from '../lib/youtubeLocalLibrary';

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
type StoredHistory = { videoId: string; progressSeconds: number; durationSeconds: number | null; updatedAt?: number };

function progressKey(accountId: string | null, videoId: string): string {
  return 'kairo-youtube-progress:' + (accountId ?? 'guest') + ':' + videoId;
}

async function responsePayload(response: Response): Promise<any> {
  return response.json().catch(() => null);
}


type LocalProgress = { seconds: number; updatedAt: number };

function readLocalProgress(accountId: string | null, videoId: string): LocalProgress {
  try {
    const raw = localStorage.getItem(progressKey(accountId, videoId));
    if (!raw) return { seconds: 0, updatedAt: 0 };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Number.isFinite(Number(parsed.seconds))) {
        return { seconds: Math.max(0, Number(parsed.seconds)), updatedAt: Math.max(0, Number(parsed.updatedAt) || 0) };
      }
    } catch { /* legacy storage held plain seconds */ }
    const seconds = Number(raw);
    return { seconds: Number.isFinite(seconds) ? Math.max(0, seconds) : 0, updatedAt: 0 };
  } catch {
    return { seconds: 0, updatedAt: 0 };
  }
}

function writeLocalProgress(accountId: string | null, videoId: string, seconds: number, updatedAt: number): void {
  try {
    localStorage.setItem(progressKey(accountId, videoId), JSON.stringify({ seconds, updatedAt }));
  } catch { /* browser storage may be unavailable */ }
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
  const { accountId, resolved: accountResolved, error: accountError } = useAccountScope();
  const [startSeconds, setStartSeconds] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lastRemoteSave = useRef(0);

  useEffect(() => {
    let active = true;
    if (!accountResolved || accountError) {
      if (accountError) {
        setError('Could not verify your Kairo account. Playback state is locked until the connection is restored.');
        setLoading(false);
      }
      return () => { active = false; };
    }
    const load = async () => {
      setLoading(true);
      setError('');
      setVideo(null);
      setStartSeconds(0);
      try {
        const videoResponse = await fetch('/api/v1/youtube/videos/' + encodeURIComponent(videoId), { headers: { Accept: 'application/json' } });
        const videoPayload = await responsePayload(videoResponse);
        if (!videoResponse.ok || !videoPayload?.success || !videoPayload.data) {
          throw new Error(videoPayload?.error?.message ?? 'This YouTube video could not be found.');
        }
        const madeForKids = videoPayload.data.madeForKids === true;
        let history: StoredHistory | null = null;
        let saved = false;
        if (accountId && !madeForKids) {
          const [historyResponse, laterResponse] = await Promise.all([
            fetch('/api/v1/youtube/history', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
            fetch('/api/v1/youtube/watch-later', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
          ]);
          const historyPayload = historyResponse.ok ? await responsePayload(historyResponse) : null;
          const laterPayload = laterResponse.ok ? await responsePayload(laterResponse) : null;
          history = (historyPayload?.data?.items ?? []).find((item: StoredHistory) => item.videoId === videoId) ?? null;
          saved = (laterPayload?.data?.items ?? []).some((item: { videoId: string }) => item.videoId === videoId);
        } else if (!accountId && !madeForKids) {
          const localHistory = readGuestYouTubeHistory().find(item => item.videoId === videoId);
          history = localHistory ? { videoId, progressSeconds: Number(localHistory.progressSeconds ?? 0), durationSeconds: localHistory.durationSeconds } : null;
          saved = readGuestYouTubeWatchLater().some(item => item.videoId === videoId);
        }
        const localRecord = madeForKids ? { seconds: 0, updatedAt: 0 } : readLocalProgress(accountId, videoId);
        const remoteUpdatedAt = Number(history?.updatedAt ?? 0);
        const preferLocal = Boolean(accountId && localRecord.seconds > 0 && localRecord.updatedAt > remoteUpdatedAt);
        const resume = preferLocal
          ? localRecord.seconds
          : history && Number.isFinite(history.progressSeconds) ? history.progressSeconds : localRecord.seconds;
        if (active) {
          const routeVideo = location.state && typeof location.state === 'object'
            ? (location.state as { youtubeCurrentVideo?: YouTubeCardVideo }).youtubeCurrentVideo
            : undefined;
          const details = videoPayload.data as VideoDetails;
          if (accountId && preferLocal && !madeForKids) {
            void fetch('/api/v1/youtube/history', {
              method: 'POST', credentials: 'same-origin',
              headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoId, title: details.title, description: details.description,
                thumbnailUrl: details.thumbnailUrl, channelId: details.channelId,
                channelTitle: details.channelTitle, publishedAt: details.publishedAt,
                durationSeconds: details.durationSeconds, progressSeconds: localRecord.seconds,
                completed: details.durationSeconds !== null && localRecord.seconds >= details.durationSeconds,
              }),
            }).catch(() => { /* local timestamped progress is retried on the next visit or player event */ });
          }
          setVideo({
            ...details,
            channelAvatarUrl: details.channelAvatarUrl ?? routeVideo?.channelAvatarUrl ?? null,
          });
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
  }, [videoId, accountResolved, accountError, accountId]);

  const onProgress = useCallback((seconds: number, duration: number, completed: boolean, reason: 'timeupdate' | 'pause' | 'ended' | 'pagehide') => {
    if (!video || video.madeForKids || !Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return;
    const position = completed ? duration : Math.max(0, Math.min(duration, seconds));
    const now = Date.now();
    writeLocalProgress(accountId, video.videoId, position, now);
    if (!accountId) {
      saveGuestYouTubeProgress({
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
      });
      return;
    }
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
    if (!video || video.madeForKids || saving) return;
    setSaving(true);
    setError('');
    try {
      if (!accountId) {
        addGuestYouTubeWatchLater({
          videoId: video.videoId, title: video.title, description: video.description,
          thumbnailUrl: video.thumbnailUrl, channelId: video.channelId, channelTitle: video.channelTitle,
          publishedAt: video.publishedAt, durationSeconds: video.durationSeconds,
        });
        setIsSaved(true);
        return;
      }
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
            <YouTubeIframePlayer
              key={video.videoId}
              videoId={video.videoId}
              title={video.title}
              startSeconds={startSeconds}
              onProgress={video.madeForKids ? undefined : onProgress}
            />
          </section>
          <div className="kc-player-toolbar">
            <div className="kc-player-toolbar-left"><span className="kc-live-dot" /> <span>YouTube player</span><span className="kc-toolbar-divider" /><span>{video.durationSeconds ? Math.floor(video.durationSeconds / 60) + ' min' : 'Video'}</span></div>
            <div className="kc-player-toolbar-actions">
              {video.madeForKids ? (
                <span className="kc-player-tool" role="note">History is off for this video</span>
              ) : (
                <button type="button" className={'kc-player-tool' + (isSaved ? ' is-on' : '')} onClick={() => void saveToWatchLater()} disabled={isSaved || saving} aria-pressed={isSaved}>
                  {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}{isSaved ? 'Saved' : saving ? 'Saving…' : 'Watch later'}
                </button>
              )}
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
            {!video.madeForKids && <Link to="/youtube/history"><History size={14} /> Watch history</Link>}
            {!video.madeForKids && <Link to="/youtube/watch-later"><Bookmark size={14} /> Watch Later</Link>}
            <a href={video.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open on YouTube</a>
          </div>
        </aside>
      </div>
    </section>
  );
}
