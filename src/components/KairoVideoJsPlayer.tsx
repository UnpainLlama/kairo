import { createElement, useEffect, useRef, useState } from 'react';
import type { PlaybackSaveReason } from '../lib/playbackSync';
import type { SavedPlayerState } from '../lib/mediaPlayback';

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
  onProgress?: (seconds: number, reason: PlaybackSaveReason, playerState?: SavedPlayerState) => void;
  initialPlayerState?: SavedPlayerState | null;
};

type VideoJsMediaElement = HTMLElement & {
  currentTime: number;
  duration: number;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
  textTracks?: TextTrackList;
  paused?: boolean;
  seeking?: boolean;
  ended?: boolean;
  readyState?: number;
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
  onProgress,
  initialPlayerState,
}: Props) {
  const mediaRef = useRef<VideoJsMediaElement | null>(null);
  const [skip, setSkip] = useState<'intro' | 'outro' | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const storageKey = `kairo-progress:${progressKey}`;
    let lastLocalSaveAt = 0;
    let waitingForData = false;
    const readPlayerState = (): SavedPlayerState => {
      const state: SavedPlayerState = {};
      if (typeof media.volume === 'number' && Number.isFinite(media.volume)) state.volume = Math.max(0, Math.min(1, media.volume));
      if (typeof media.muted === 'boolean') state.muted = media.muted;
      if (typeof media.playbackRate === 'number' && Number.isFinite(media.playbackRate)) state.playbackRate = Math.max(0.25, Math.min(2, media.playbackRate));
      const tracks = media.textTracks;
      if (tracks) {
        const active = Array.from(tracks).find(track => track.mode === 'showing');
        if (active?.language && /^[A-Za-z0-9_-]{1,40}$/.test(active.language)) state.subtitleLanguage = active.language;
      }
      return state;
    };
    const saveProgress = (reason: PlaybackSaveReason) => {
      const time = media.currentTime;
      const duration = media.duration;
      if (!Number.isFinite(time) || time < 0) return;
      const position = reason === 'ended' && Number.isFinite(duration) && duration > 0 ? duration : time;
      try { localStorage.setItem(storageKey, String(position)); } catch { /* storage may be unavailable */ }
      onProgress?.(position, reason, readPlayerState());
    };
    const restore = () => {
      let saved = 0;
      try { saved = Number(localStorage.getItem(storageKey) || 0); } catch { /* storage may be unavailable */ }
      if (saved > 0 && Number.isFinite(media.duration) && saved < media.duration - 15) media.currentTime = saved;
      if (initialPlayerState) {
        if (typeof initialPlayerState.volume === 'number') media.volume = initialPlayerState.volume;
        if (typeof initialPlayerState.muted === 'boolean') media.muted = initialPlayerState.muted;
        if (typeof initialPlayerState.playbackRate === 'number') media.playbackRate = initialPlayerState.playbackRate;
        if (initialPlayerState.subtitleLanguage && media.textTracks) {
          Array.from(media.textTracks).forEach(track => { track.mode = track.language === initialPlayerState.subtitleLanguage ? 'showing' : 'disabled'; });
        }
      }
      saveProgress('open');
    };
    const updateProgress = () => {
      if (waitingForData || media.paused === true || media.seeking === true || media.ended === true ||
          (typeof media.readyState === 'number' && media.readyState < 3)) return;
      const time = media.currentTime;
      const duration = media.duration;
      if (!Number.isFinite(time)) return;
      const now = Date.now();
      // Keep an instant local resume point without writing on every timeupdate.
      if (now - lastLocalSaveAt >= 5000) {
        try { localStorage.setItem(storageKey, String(time)); } catch { /* storage may be unavailable */ }
        lastLocalSaveAt = now;
      }
      // The watch page throttles remote writes to one per 15 seconds.
      onProgress?.(time, 'timeupdate', readPlayerState());
      setSkip(introEnd && time > 5 && time < introEnd ? 'intro' : outroStart && time >= outroStart ? 'outro' : null);
      setRemaining(nextUrl && Number.isFinite(duration) && duration - time <= 15 && duration - time > 0
        ? Math.ceil(duration - time)
        : null);
    };
    const onPlay = () => saveProgress('play');
    const onPause = () => saveProgress('pause');
    const onSeeked = () => saveProgress('seeked');
    const onEnded = () => { saveProgress('ended'); if (nextUrl) window.location.assign(nextUrl); };
    const onWaiting = () => { waitingForData = true; };
    const onPlaying = () => { waitingForData = false; };
    const onPageHide = () => saveProgress('pagehide');
    const onVolumeChange = () => saveProgress('volumechange');
    const onRateChange = () => saveProgress('ratechange');
    const onTextTrackChange = () => saveProgress('subtitlechange');
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveProgress('pagehide');
    };

    media.addEventListener('loadedmetadata', restore);
    media.addEventListener('timeupdate', updateProgress);
    media.addEventListener('waiting', onWaiting);
    media.addEventListener('stalled', onWaiting);
    media.addEventListener('playing', onPlaying);
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('seeked', onSeeked);
    media.addEventListener('volumechange', onVolumeChange);
    media.addEventListener('ratechange', onRateChange);
    media.textTracks?.addEventListener('change', onTextTrackChange);
    media.addEventListener('ended', onEnded);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      // Also flush when React navigates away without a full page unload.
      saveProgress('pagehide');
      media.removeEventListener('loadedmetadata', restore);
      media.removeEventListener('timeupdate', updateProgress);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('stalled', onWaiting);
      media.removeEventListener('playing', onPlaying);
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('seeked', onSeeked);
      media.removeEventListener('volumechange', onVolumeChange);
      media.removeEventListener('ratechange', onRateChange);
      media.textTracks?.removeEventListener('change', onTextTrackChange);
      media.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [src, progressKey, introEnd, outroStart, nextUrl, onProgress, initialPlayerState]);

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
  const mediaProps = {
    ref: (element: HTMLElement | null) => { mediaRef.current = element as VideoJsMediaElement | null; },
    className: 'kc-videojs-media',
    src,
    playsInline: true,
    preload: 'metadata',
  };
  const media = createElement(mediaType === 'hls' ? 'hlsjs-video' : 'video', mediaProps as any, ...tracks);
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
