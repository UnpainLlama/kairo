import { useMemo } from 'react';
import KairoVideoJsPlayer from './KairoVideoJsPlayer';

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
};

function safeHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function youtubeEmbed(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\\./, '');
  let id = '';
  if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] ?? '';
  else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
    else if (/^\\/(embed|shorts|live)\\//.test(url.pathname)) id = url.pathname.split('/')[2] ?? '';
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0` : null;
}

export default function KairoMediaPlayer({ source, title, progressKey, introEnd, outroStart, nextUrl }: Props) {
  const rawUrl = source.protocol === 'hls' ? source.manifestUrl : source.protocol === 'file' ? source.mediaUrl : source.embedUrl;
  const safeUrl = useMemo(() => safeHttpsUrl(rawUrl), [rawUrl]);
  const youtubeUrl = useMemo(() => safeUrl ? youtubeEmbed(safeUrl) : null, [safeUrl]);

  if (!safeUrl) return <div className="kc-player-message" role="alert"><h2>Unsafe playback source</h2><p>Kairo only loads secure HTTPS media sources.</p></div>;
  if (source.protocol === 'hls') {
    return <KairoVideoJsPlayer src={safeUrl.href} title={title} progressKey={progressKey} subtitles={source.protocol === 'hls' ? source.subtitles : []} mediaType={source.protocol} introEnd={introEnd} outroStart={outroStart} nextUrl={nextUrl} />;
  }
  if (source.protocol === 'file') {
    return <KairoVideoJsPlayer src={safeUrl.href} title={title} progressKey={progressKey} subtitles={source.subtitles ?? []} mediaType="file" />;
  }

  // Third-party providers keep their own playback engine. Kairo cannot control
  // arbitrary cross-origin iframes unless the provider exposes a supported API.
  return <div className="kc-external-player" data-provider={youtubeUrl ? 'youtube' : source.provider.toLowerCase()}>
    <iframe
      className="kc-player-frame"
      src={youtubeUrl ?? safeUrl.href}
      title={`${title} — ${youtubeUrl ? 'YouTube' : source.provider} player`}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
    <span className="kc-external-provider-label">{youtubeUrl ? 'YouTube player' : `${source.provider} player`}</span>
  </div>;
}
