import { useMemo } from 'react';
import AnimeEmbedPlayer from './AnimeEmbedPlayer';
import KairoVideoJsPlayer from './KairoVideoJsPlayer';
import YouTubeIframePlayer from './YouTubeIframePlayer';
import type { PlaybackSaveReason } from '../lib/playbackSync';
import type { SavedPlayerState } from '../lib/mediaPlayback';

type Subtitle = { language: string; label: string; url: string; format: 'vtt' };
type Variant = { label: string; height?: number };
const EMPTY_SUBTITLES: Subtitle[] = [];
export type KairoPlaybackSource =
  | { provider: string; protocol: 'hls'; manifestUrl: string; subtitles?: Subtitle[]; variants?: Variant[] }
  | { provider: string; protocol: 'file'; mediaUrl: string; mimeType?: string; subtitles?: Subtitle[] }
  | { provider: string; protocol: 'embed'; embedUrl: string };

type Props = {
  source: KairoPlaybackSource;
  title: string;
  progressKey: string;
  introEnd?: number | null;
  outroStart?: number | null;
  nextUrl?: string | null;
  onProgress?: (seconds: number, reason: PlaybackSaveReason, playerState?: SavedPlayerState, durationSeconds?: number | null) => void;
  initialPlayerState?: SavedPlayerState | null;
  initialProgressSeconds?: number;
  defaultPlaybackSpeed?: number;
  defaultSubtitleLanguage?: string;
  subtitleSize?: 'small' | 'medium' | 'large';
};

function safeHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id = '';
  if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] ?? '';
  else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
    else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] ?? '';
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function readSavedSeconds(progressKey: string): number {
  try {
    const value = Number(localStorage.getItem('kairo-progress:' + progressKey) ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

export default function KairoMediaPlayer({ source, title, progressKey, introEnd, outroStart, nextUrl, onProgress, initialPlayerState, initialProgressSeconds = 0, defaultPlaybackSpeed = 1, defaultSubtitleLanguage = 'en', subtitleSize = 'medium' }: Props) {
  const rawUrl = source.protocol === 'hls' ? source.manifestUrl : source.protocol === 'file' ? source.mediaUrl : source.embedUrl;
  const safeUrl = useMemo(() => safeHttpsUrl(rawUrl), [rawUrl]);
  const videoId = useMemo(() => safeUrl ? youtubeVideoId(safeUrl) : null, [safeUrl]);

  if (!safeUrl) return <div className="kc-player-message" role="alert"><h2>Unsafe playback source</h2><p>Kairo only loads secure HTTPS media sources.</p></div>;
  if (source.protocol === 'hls') {
    return <KairoVideoJsPlayer src={safeUrl.href} title={title} progressKey={progressKey} subtitles={source.subtitles ?? EMPTY_SUBTITLES} mediaType={source.protocol} initialPlayerState={initialPlayerState} initialProgressSeconds={initialProgressSeconds} defaultPlaybackSpeed={defaultPlaybackSpeed} defaultSubtitleLanguage={defaultSubtitleLanguage} subtitleSize={subtitleSize} introEnd={introEnd} outroStart={outroStart} nextUrl={nextUrl} onProgress={onProgress} />;
  }
  if (source.protocol === 'file') {
    return <KairoVideoJsPlayer src={safeUrl.href} title={title} progressKey={progressKey} subtitles={source.subtitles ?? EMPTY_SUBTITLES} mediaType="file" initialPlayerState={initialPlayerState} initialProgressSeconds={initialProgressSeconds} defaultPlaybackSpeed={defaultPlaybackSpeed} defaultSubtitleLanguage={defaultSubtitleLanguage} subtitleSize={subtitleSize} onProgress={onProgress} />;
  }
  if (videoId) {
    return <YouTubeIframePlayer
      videoId={videoId}
      title={title}
      startSeconds={Math.max(readSavedSeconds(progressKey), Number.isFinite(initialProgressSeconds) ? initialProgressSeconds : 0)}
      initialPlayerState={initialPlayerState}
      onProgress={(seconds, duration, _completed, reason, state) => onProgress?.(seconds, reason, state, duration)}
    />;
  }

  // Anime embeds have their own iframe boundary. Movie embeds live in MovieEmbedPlayer.
  return <AnimeEmbedPlayer
    src={safeUrl.href}
    title={title}
    provider={source.provider.toLowerCase()}
    progressKey={progressKey}
    onProgress={onProgress}
    playerState={initialPlayerState}
  />;
}
