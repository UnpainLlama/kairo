import { createElement, useEffect, useRef, useState } from 'react';

type Subtitle = { language: string; label: string; url: string; format: 'vtt' };

type Props = {
  src: string;
  title: string;
  progressKey: string;
  subtitles?: Subtitle[];
  introEnd?: number | null;
  outroStart?: number | null;
  nextUrl?: string | null;
  mediaType?: 'hls' | 'file';
};

type VideoJsMediaElement = HTMLElement & {
  currentTime: number;
  duration: number;
};

export default function KairoVideoJsPlayer({
  src,
  title,
  progressKey,
  subtitles = [],
  introEnd,
  outroStart,
  nextUrl,
  mediaType = 'hls',
}: Props) {
  const mediaRef = useRef<VideoJsMediaElement | null>(null);
  const [skip, setSkip] = useState<'intro' | 'outro' | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const storageKey = `kairo-progress:${progressKey}`;
    const restore = () => {
      let saved = 0;
      try { saved = Number(localStorage.getItem(storageKey) || 0); } catch { /* storage may be unavailable */ }
      if (saved > 0 && Number.isFinite(media.duration) && saved < media.duration - 15) {
        media.currentTime = saved;
      }
    };
    const updateProgress = () => {
      const time = media.currentTime;
      const duration = media.duration;
      if (!Number.isFinite(time)) return;
      try { localStorage.setItem(storageKey, String(time)); } catch { /* storage may be unavailable */ }
      setSkip(introEnd && time > 5 && time < introEnd ? 'intro' : outroStart && time >= outroStart ? 'outro' : null);
      setRemaining(nextUrl && Number.isFinite(duration) && duration - time <= 15 && duration - time > 0
        ? Math.ceil(duration - time)
        : null);
    };
    const playNext = () => { if (nextUrl) window.location.assign(nextUrl); };

    media.addEventListener('loadedmetadata', restore);
    media.addEventListener('timeupdate', updateProgress);
    media.addEventListener('ended', playNext);
    return () => {
      media.removeEventListener('loadedmetadata', restore);
      media.removeEventListener('timeupdate', updateProgress);
      media.removeEventListener('ended', playNext);
    };
  }, [src, progressKey, introEnd, outroStart, nextUrl]);

  const seekTo = (target: 'intro' | 'outro') => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = target === 'intro' ? (introEnd ?? media.currentTime) : (media.duration || media.currentTime);
    setSkip(null);
  };

  const tracks = subtitles.map((track) => createElement('track', {
    key: track.url,
    kind: 'subtitles',
    src: track.url,
    srcLang: track.language,
    label: track.label,
  }));
  const media = createElement(mediaType === 'hls' ? 'hlsjs-video' : 'video', {
    ref: (element: HTMLElement | null) => { mediaRef.current = element as VideoJsMediaElement | null; },
    className: 'kc-videojs-media',
    src,
    playsInline: true,
    preload: 'metadata',
  }, ...tracks);
  const skin = createElement('video-skin', { className: 'kc-videojs-skin' }, media);
  const player = createElement('video-player', { className: 'kc-videojs-element', title }, skin);

  return (
    <div className="kc-videojs-player" aria-label={title}>
      {player}
      {skip && (
        <button className="kc-videojs-skip" type="button" onClick={() => seekTo(skip)}>
          Skip {skip}
        </button>
      )}
      {remaining !== null && nextUrl && (
        <div className="kc-videojs-next">
          <span>Next episode in {remaining}s</span>
          <a href={nextUrl}>Play next</a>
        </div>
      )}
    </div>
  );
}
