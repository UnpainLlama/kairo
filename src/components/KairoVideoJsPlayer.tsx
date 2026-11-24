import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
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
  onProgress?: (seconds: number, reason: PlaybackSaveReason, playerState?: SavedPlayerState, durationSeconds?: number | null) => void;
  initialPlayerState?: SavedPlayerState | null;
  initialProgressSeconds?: number;
  defaultPlaybackSpeed?: number;
  defaultSubtitleLanguage?: string;
  subtitleSize?: 'small' | 'medium' | 'large';
};

type VideoJsMediaElement = HTMLVideoElement;

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
  initialProgressSeconds = 0,
  defaultPlaybackSpeed = 1,
  defaultSubtitleLanguage = 'en',
  subtitleSize = 'medium',
}: Props) {
  const mediaRef = useRef<VideoJsMediaElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const initialPlayerStateRef = useRef(initialPlayerState);
  const initialProgressSecondsRef = useRef(initialProgressSeconds);
  useEffect(() => { initialPlayerStateRef.current = initialPlayerState; }, [initialPlayerState]);
  useEffect(() => { initialProgressSecondsRef.current = initialProgressSeconds; }, [initialProgressSeconds]);
  const [skip, setSkip] = useState<'intro' | 'outro' | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [qualityOptions, setQualityOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedQuality, setSelectedQuality] = useState('auto');
  const [selectedSubtitle, setSelectedSubtitle] = useState(defaultSubtitleLanguage);
  useEffect(() => { setSelectedSubtitle(defaultSubtitleLanguage); }, [defaultSubtitleLanguage]);

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
      const currentLevel = hlsRef.current?.currentLevel ?? -1;
      state.quality = currentLevel < 0 ? 'auto' : String(currentLevel);
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
      onProgress?.(position, reason, readPlayerState(), Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    const restore = () => {
      let localSaved = 0;
      try {
        const candidate = Number(localStorage.getItem(storageKey) || 0);
        localSaved = Number.isFinite(candidate) && candidate >= 0 ? candidate : 0;
      } catch { /* storage may be unavailable */ }
      const remoteCandidate = Number(initialProgressSecondsRef.current);
      const remoteSaved = Number.isFinite(remoteCandidate) ? Math.max(0, remoteCandidate) : 0;
      const resumeAt = Math.max(localSaved, remoteSaved);
      if (resumeAt > 0 && Number.isFinite(media.duration) && resumeAt < media.duration - 15) media.currentTime = resumeAt;
      const savedState = initialPlayerStateRef.current;
      media.playbackRate = savedState?.playbackRate ?? defaultPlaybackSpeed;
      if (savedState) {
        if (typeof savedState.volume === 'number') media.volume = savedState.volume;
        if (typeof savedState.muted === 'boolean') media.muted = savedState.muted;
      }
      const requestedSubtitle = savedState?.subtitleLanguage ?? defaultSubtitleLanguage;
      const preferredSubtitle = requestedSubtitle === 'off' || subtitles.some(track => track.language === requestedSubtitle)
        ? requestedSubtitle
        : 'off';
      setSelectedSubtitle(preferredSubtitle);
      if (media.textTracks && preferredSubtitle) {
        Array.from(media.textTracks).forEach(track => {
          track.mode = preferredSubtitle !== 'off' && track.language === preferredSubtitle ? 'showing' : 'disabled';
        });
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
      onProgress?.(time, 'timeupdate', readPlayerState(), Number.isFinite(duration) && duration > 0 ? duration : null);
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
  }, [src, progressKey, introEnd, outroStart, nextUrl, onProgress, defaultPlaybackSpeed, defaultSubtitleLanguage, subtitles]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    setPlaybackError('');
    setQualityOptions([]);
    setSelectedQuality('auto');
    const onNativeError = () => setPlaybackError('The media source could not be loaded or may have expired. Try reloading or select another server.');
    media.addEventListener('error', onNativeError);
    if (mediaType === 'hls' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, backBufferLength: 90 });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels.map((level, index) => ({
          value: String(index),
          label: level.height ? (level.height + 'p') : (typeof level.bitrate === 'number' && Number.isFinite(level.bitrate) ? Math.round(level.bitrate / 1000) + ' kbps' : 'Source ' + (index + 1)),
        }));
        setQualityOptions(levels.length ? [{ value: 'auto', label: 'Auto' }, ...levels] : []);
        const savedQuality = initialPlayerStateRef.current?.quality;
        if (savedQuality && savedQuality !== 'auto' && /^\d{1,3}$/.test(savedQuality) && Number(savedQuality) < levels.length) {
          hls.currentLevel = Number(savedQuality);
          setSelectedQuality(savedQuality);
        }
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, () => {
        setSelectedQuality(hls.currentLevel < 0 ? 'auto' : String(hls.currentLevel));
      });
      hls.on(Hls.Events.ERROR, (_event, data: { fatal?: boolean }) => {
        if (data?.fatal) setPlaybackError('The stream could not be loaded or the source may have expired. Try reloading or select another server.');
      });
      hls.loadSource(src);
      hls.attachMedia(media);
      return () => {
        hls.destroy();
        if (hlsRef.current === hls) hlsRef.current = null;
        media.removeEventListener('error', onNativeError);
        media.pause();
        media.removeAttribute('src');
        media.load();
      };
    }
    if (mediaType === 'file' || media.canPlayType('application/vnd.apple.mpegurl')) {
      media.src = src;
    } else {
      setPlaybackError('This browser cannot play HLS video. Try a browser with native HLS support.');
    }
    return () => {
      media.removeEventListener('error', onNativeError);
      media.pause();
      media.removeAttribute('src');
      media.load();
    };
  }, [src, mediaType, reloadAttempt]);

  const seekTo = (target: 'intro' | 'outro') => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = target === 'intro' ? (introEnd ?? media.currentTime) : (media.duration || media.currentTime);
    setSkip(null);
  };

  return (
    <div className={"kc-videojs-player subtitle-" + subtitleSize} aria-label={title}>
      {(qualityOptions.length > 0 || subtitles.length > 0) && (
        <div className="kc-player-settings">
          {qualityOptions.length > 0 && (
            <label>
              Quality
              <select value={selectedQuality} onChange={event => {
                const value = event.target.value;
                const level = value === 'auto' ? -1 : Number(value);
                if (hlsRef.current) hlsRef.current.currentLevel = Number.isFinite(level) ? level : -1;
                setSelectedQuality(value);
              }} aria-label="Video quality">
                {qualityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          {subtitles.length > 0 && (
            <label>
              Subtitles
              <select value={selectedSubtitle} onChange={event => {
                const language = event.target.value;
                const tracks = mediaRef.current?.textTracks;
                if (tracks) Array.from(tracks).forEach(track => {
                  track.mode = language !== 'off' && track.language === language ? 'showing' : 'disabled';
                });
                setSelectedSubtitle(language);
              }} aria-label="Subtitle language">
                <option value="off">Off</option>
                {subtitles.map(track => <option key={track.url} value={track.language}>{track.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      <video
        ref={mediaRef}
        className="kc-videojs-media kc-videojs-element"
        aria-label={title}
        playsInline
        controls
        preload="metadata"
      >
        {subtitles.map(track => (
          <track
            key={track.url}
            kind="subtitles"
            src={track.url}
            srcLang={track.language}
            label={track.label}
          />
        ))}
      </video>
      {playbackError && <div className="kc-player-message" role="alert"><p>{playbackError}</p><button type="button" className="button button-secondary small" onClick={() => setReloadAttempt(value => value + 1)}>Retry stream</button></div>}
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
