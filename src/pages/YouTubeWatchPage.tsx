import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import YouTubeVideoCard, { type YouTubeCardVideo } from '../components/YouTubeVideoCard';
import { ArrowLeft, Bookmark, ExternalLink, Youtube } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      setVideo(null);
      try {
        const response = await fetch('/api/v1/youtube/videos/' + encodeURIComponent(videoId), { headers: { Accept: 'application/json' } });
        const payload = await responsePayload(response);
        if (!response.ok || !payload?.success || !payload.data) {
          throw new Error(payload?.error?.message ?? 'This YouTube video could not be found.');
        }

        const details = payload.data as VideoDetails;
        if (active) {
          const routeVideo = location.state && typeof location.state === 'object'
            ? (location.state as { youtubeCurrentVideo?: YouTubeCardVideo }).youtubeCurrentVideo
            : undefined;
          setVideo({
            ...details,
            channelAvatarUrl: details.channelAvatarUrl ?? routeVideo?.channelAvatarUrl ?? null,
          });
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
            />
          </section>
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
            {!video.madeForKids && <Link to="/youtube/watch-later"><Bookmark size={14} /> Watch Later</Link>}
            <a href={video.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open on YouTube</a>
          </div>
        </aside>
      </div>
    </section>
  );
}
