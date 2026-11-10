import { useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  title: string;
  progressKey: string;
  introEnd?: number | null;
  outroStart?: number | null;
  nextUrl?: string | null;
};

type VideoJsMediaElement = HTMLElement & {
  currentTime: number;
  duration: number;
};

const stamp = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function KairoVideoJsPlayer({
  src,
  title,
  progressKey,
  introEnd,
  outroStart,
  nextUrl,
}: Props) {
  const mediaRef = useRef<VideoJsMediaElement | null>(null);
  const [skip, setSkip] = useState<'intro' | 'outro' | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const storageKey = `kairo-progress:${progressKey}`;
    const restore = () => {
      const saved = Number(localStorage.getItem(storageKey) || 0);
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

  return (
    <div className="kc-videojs-player" aria-label={title}>
      <video-player class="kc-videojs-element" title={title}>
        <video-skin class="kc-videojs-skin">
          <hlsjs-video
            ref={mediaRef}
            class="kc-videojs-media"
            src={src}
            playsinline=""
            preload="metadata"
          />
        </video-skin>
      </video-player>
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
