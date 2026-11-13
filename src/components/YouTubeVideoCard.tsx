import { Link } from 'react-router-dom';
import { Clock3, Youtube } from 'lucide-react';

export type YouTubeCardVideo = {
  videoId: string;
  title: string;
  description?: string;
  thumbnailUrl: string | null;
  channelId?: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds?: number | null;
};

type YouTubeVideoCardProps = {
  video: YouTubeCardVideo;
  relatedVideos?: YouTubeCardVideo[];
  channelAvatarUrl?: string | null;
  compact?: boolean;
  layout?: 'grid' | 'list';
};

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours > 0
    ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0')
    : minutes + ':' + String(remainder).padStart(2, '0');
}

function publishedLabel(value: string | null): string {
  if (!value) return 'YouTube';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'YouTube';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
  if (seconds < 2592000) return Math.floor(seconds / 604800) + ' weeks ago';
  if (seconds < 31536000) return Math.floor(seconds / 2592000) + ' months ago';
  return Math.floor(seconds / 31536000) + ' years ago';
}

export default function YouTubeVideoCard({ video, relatedVideos = [], channelAvatarUrl, compact = false, layout = 'grid' }: YouTubeVideoCardProps) {
  const related = relatedVideos.filter(item => item.videoId !== video.videoId);
  const navigationState = { youtubeRelatedVideos: related };
  const isList = layout === 'list';

  return (
    <article className={'yt-video-card' + (compact ? ' yt-video-card-compact' : '') + (isList ? ' yt-video-card-list' : '')}>
      <Link
        className="yt-video-thumb"
        to={'/youtube/watch/' + video.videoId}
        state={navigationState}
        aria-label={'Watch ' + video.title + ' in Kairo'}
      >
        {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : <span><Youtube size={28} /></span>}
        {video.durationSeconds != null && <span className="yt-video-duration"><Clock3 size={11} />{formatDuration(video.durationSeconds)}</span>}
      </Link>
      <div className="yt-video-meta">
        <span className="yt-video-avatar">
          {channelAvatarUrl ? <img src={channelAvatarUrl} alt="" loading="lazy" /> : (video.channelTitle.trim().slice(0, 1).toUpperCase() || 'Y')}
        </span>
        <div className="yt-video-copy">
          <h3><Link to={'/youtube/watch/' + video.videoId} state={navigationState}>{video.title}</Link></h3>
          <p>{isList ? (video.channelTitle || 'YouTube') + ' · ' + publishedLabel(video.publishedAt) : (video.channelTitle || 'YouTube')}</p>
          {isList && video.description
            ? <small className="yt-video-description-preview">{video.description}</small>
            : !isList && <small>{publishedLabel(video.publishedAt)}</small>}
        </div>
      </div>
    </article>
  );
}
