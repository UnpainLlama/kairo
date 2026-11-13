import KairoMediaPlayer, { type KairoPlaybackSource } from './KairoMediaPlayer';
import YouTubeIframePlayer, { type YouTubeProgressReason } from './YouTubeIframePlayer';
import type { PlaybackSaveReason } from '../lib/playbackSync';

export type UniversalPlayerSource =
  | { kind: 'anime'; playback: KairoPlaybackSource }
  | { kind: 'youtube'; videoId: string };

type Props = {
  source: UniversalPlayerSource;
  title: string;
  progressKey?: string;
  startSeconds?: number;
  introEnd?: number | null;
  outroStart?: number | null;
  nextUrl?: string | null;
  onMediaProgress?: (seconds: number, reason: PlaybackSaveReason) => void;
  onYouTubeProgress?: (seconds: number, duration: number, completed: boolean, reason: YouTubeProgressReason) => void;
};

/**
 * One Kairo player entry point with capability-aware adapters.
 * Native media and HLS can use Kairo's UI. Cross-origin embeds keep the
 * provider's own controls; YouTube always uses its supported IFrame API.
 */
export default function UniversalPlayer({
  source, title, progressKey, startSeconds = 0, introEnd, outroStart, nextUrl, onMediaProgress, onYouTubeProgress,
}: Props) {
  if (source.kind === 'youtube') {
    return <YouTubeIframePlayer key={source.videoId} videoId={source.videoId} title={title} startSeconds={startSeconds} onProgress={onYouTubeProgress} />;
  }
  if (!progressKey) {
    return <div className="kc-player-message" role="alert"><h2>Playback state unavailable</h2><p>Kairo could not initialise progress tracking for this media.</p></div>;
  }
  return <KairoMediaPlayer source={source.playback} title={title} progressKey={progressKey} introEnd={introEnd} outroStart={outroStart} nextUrl={nextUrl} onProgress={onMediaProgress} />;
}
