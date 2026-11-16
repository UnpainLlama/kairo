import { useEffect, useMemo } from 'react';
import KairoVideoJsPlayer from './KairoVideoJsPlayer';
import YouTubeIframePlayer from './YouTubeIframePlayer';
import type { PlaybackSaveReason } from '../lib/playbackSync';
import type { SavedPlayerState } from '../lib/mediaPlayback';

type Subtitle = { language: string; label: string; url: string; format: 'vtt' };
type Variant = { label: string; height?: number };
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
  onProgress?: (seconds: number, reason: PlaybackSaveReason, playerState?: SavedPlayerState) => void;
  initialPlayerState?: SavedPlayerState | null;
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

/** For third-party iframes without a supported player API, only the last known position can be flushed. */
function OpaqueProviderEmbed({ src, title, provider, progressKey, onProgress, playerState }: {
  src: string; title: string; provider: string; progressKey: string;
  onProgress?: Props['onProgress']; playerState?: SavedPlayerState | null;
}) {
  useEffect(() => {
    const seconds = readSavedSeconds(progressKey);
    onProgress?.(seconds, 'open', playerState ?? {});
    const flush = () => onProgress?.(readSavedSeconds(progressKey), 'pagehide', playerState ?? {});
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [progressKey, onProgress, playerState]);

  return <div className="kc-external-player" data-provider={provider}>
    <iframe
      className="kc-player-frame"
      src={src}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
    <span className="kc-external-provider-label">{provider} player</span>
  </div>;
}

export default function KairoMediaPlayer({ source, title, progressKey, introEnd, outroStart, nextUrl, onProgress, initialPlayerState }: Props) {
  const rawUrl = source.protocol === 'hls' ? source.manifestUrl : source.protocol === 'file' ? source.mediaUrl : source.embedUrl;
  const safeUrl = useMemo(() => safeHttpsUrl(rawUrl), [rawUrl]);
  const videoId = useMemo(() => safeUrl ? youtubeVideoId(safeUrl) : null, [safeUrl]);

  if (!safeUrl) return <div className="kc-player-message" role="alert"><h2>Unsafe playback source</h2><p>Kairo only loads secure HTTPS media sources.</p></div>;
  if (source.protocol === 'hls') {
    return <KairoVideoJsPlayer src={safeUrl.href} title={title} progressKey={progressKey} subtitles={source.subtitles ?? []} mediaType={source.protocol} initialPlayerState={initialPlayerState} introEnd={introEnd} outroStart={outroStart} nextUrl={nextUrl} onProgress={onProgress} />;
  }
  if (source.protocol === 'file') {
    return <KairoVideoJsPlayer src={safeUrl.href} title={title} progressKey={progressKey} subtitles={source.subtitles ?? []} mediaType="file" initialPlayerState={initialPlayerState} onProgress={onProgress} />;
  }
  if (videoId) {
    return <YouTubeIframePlayer
      videoId={videoId}
      title={title}
      startSeconds={readSavedSeconds(progressKey)}
      initialPlayerState={initialPlayerState}
      onProgress={(seconds, _duration, _completed, reason, state) => onProgress?.(seconds, reason, state)}
    />;
  }

  // An arbitrary cross-origin iframe cannot expose progress unless its provider documents a player API.
  return <OpaqueProviderEmbed
    src={safeUrl.href}
    title={title}
    provider={source.provider.toLowerCase()}
    progressKey={progressKey}
    onProgress={onProgress}
    playerState={initialPlayerState}
  />;
}
