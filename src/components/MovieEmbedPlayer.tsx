import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CINESRC_ORIGIN, cinesrcMovieEmbedUrl } from '../lib/moviePlayback';
import type { MediaPlaybackSnapshot, SavedPlayerState } from '../lib/mediaPlayback';
import type { PlaybackSaveReason } from '../lib/playbackSync';
import '../styles-netflix.css';

type Props = {
  /** Numeric TMDB movie ID, supplied by the Movies catalogue. */
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  initialPlayback?: MediaPlaybackSnapshot | null;
  onProgress: (snapshot: MediaPlaybackSnapshot, reason: PlaybackSaveReason) => void;
  onBack: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * CineSrc provides a documented postMessage API for progress, volume, playback speed and source
 * selection. Kairo accepts messages only from CineSrc and this exact iframe.
 */
export default function MovieEmbedPlayer({ tmdbId, title, posterUrl = null, initialPlayback, onProgress, onBack }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onProgressRef = useRef(onProgress);
  const onBackRef = useRef(onBack);
  const initialPlaybackRef = useRef(initialPlayback);
  const isPlayingRef = useRef(false);
  const latestRef = useRef<MediaPlaybackSnapshot>({
    mediaType: 'movie',
    mediaKey: tmdbId,
    title,
    artworkUrl: posterUrl,
    progressSeconds: initialPlayback?.progressSeconds ?? 0,
    durationSeconds: initialPlayback?.durationSeconds ?? null,
    completed: initialPlayback?.completed ?? false,
    playerState: initialPlayback?.playerState ?? {},
    updatedAt: initialPlayback?.updatedAt ?? Date.now(),
  });

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  const embedUrl = useMemo(() => {
    try {
      return cinesrcMovieEmbedUrl(tmdbId, {
        startSeconds: initialPlaybackRef.current?.progressSeconds ?? 0,
        sourceId: initialPlaybackRef.current?.playerState.sourceId,
      });
    } catch { return null; }
  }, [tmdbId]);

  const sendCommand = (command: string, args: unknown[] = []) => {
    frameRef.current?.contentWindow?.postMessage({ type: 'cinesrc:command', command, args }, CINESRC_ORIGIN);
  };

  const publish = (reason: PlaybackSaveReason, patch: Partial<MediaPlaybackSnapshot> = {}) => {
    const previous = latestRef.current;
    const next: MediaPlaybackSnapshot = {
      ...previous,
      ...patch,
      playerState: { ...previous.playerState, ...(patch.playerState ?? {}) },
      updatedAt: Date.now(),
    };
    latestRef.current = next;
    onProgressRef.current(next, reason);
  };

  const requestFinalSnapshot = (reason: 'pagehide' | 'close') => {
    sendCommand('getCurrentTime');
    sendCommand('getDuration');
    sendCommand('getVolume');
    sendCommand('getMuted');
    sendCommand('getPlaybackRate');
    publish(reason);
  };

  useEffect(() => {
    const applySavedState = () => {
      const state = initialPlaybackRef.current?.playerState;
      if (!state) return;
      if (typeof state.volume === 'number') sendCommand('setVolume', [state.volume]);
      if (typeof state.muted === 'boolean') sendCommand('setMuted', [state.muted]);
      if (typeof state.playbackRate === 'number') sendCommand('setPlaybackRate', [state.playbackRate]);
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== CINESRC_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      if (!isRecord(event.data) || typeof event.data.type !== 'string') return;
      const data = event.data;
      switch (data.type) {
        case 'cinesrc:ready':
          isPlayingRef.current = false;
          setLoaded(true);
          setFailed(false);
          applySavedState();
          publish('open');
          break;
        case 'cinesrc:timeupdate': {
          if (!isPlayingRef.current) break;
          const currentTime = finite(data.currentTime);
          const duration = finite(data.duration);
          if (currentTime !== null) publish('timeupdate', {
            progressSeconds: currentTime,
            durationSeconds: duration && duration > 0 ? duration : latestRef.current.durationSeconds,
            completed: Boolean(duration && duration > 0 && currentTime >= duration - 2),
          });
          break;
        }
        case 'cinesrc:loadedmetadata': {
          const duration = finite(data.duration);
          if (duration && duration > 0) publish('timeupdate', { durationSeconds: duration });
          break;
        }
        case 'cinesrc:play': isPlayingRef.current = true; publish('play'); break;
        case 'cinesrc:pause': isPlayingRef.current = false; publish('pause'); break;
        case 'cinesrc:seeking': publish('seeked', { progressSeconds: finite(data.currentTime) ?? latestRef.current.progressSeconds }); break;
        case 'cinesrc:seeked': publish('seeked', { progressSeconds: finite(data.currentTime) ?? latestRef.current.progressSeconds }); break;
        case 'cinesrc:ended': {
          isPlayingRef.current = false;
          const duration = finite(data.duration) ?? latestRef.current.durationSeconds;
          publish('ended', { progressSeconds: duration ?? latestRef.current.progressSeconds, durationSeconds: duration, completed: true });
          break;
        }
        case 'cinesrc:volumechange': {
          const playerState: SavedPlayerState = { ...latestRef.current.playerState };
          const volume = finite(data.volume);
          if (volume !== null) playerState.volume = Math.min(1, volume);
          if (typeof data.muted === 'boolean') playerState.muted = data.muted;
          publish('volumechange', { playerState });
          break;
        }
        case 'cinesrc:ratechange': {
          const rate = finite(data.playbackRate);
          if (rate !== null) publish('ratechange', { playerState: { ...latestRef.current.playerState, playbackRate: Math.max(0.25, Math.min(2, rate)) } });
          break;
        }
        case 'cinesrc:sourceused': {
          if (typeof data.sourceId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(data.sourceId)) {
            publish('sourcechange', { playerState: { ...latestRef.current.playerState, sourceId: data.sourceId } });
          }
          break;
        }
        case 'cinesrc:skipintro': {
          const time = finite(data.time);
          if (time !== null) publish('seeked', { progressSeconds: time });
          break;
        }
        case 'cinesrc:response': {
          const command = data.command;
          const result = data.result;
          if (command === 'getCurrentTime') {
            const seconds = finite(result);
            if (seconds !== null) publish('pagehide', { progressSeconds: seconds });
          } else if (command === 'getDuration') {
            const duration = finite(result);
            if (duration !== null && duration > 0) publish('pagehide', { durationSeconds: duration });
          } else if (command === 'getVolume') {
            const volume = finite(result);
            if (volume !== null) publish('pagehide', { playerState: { ...latestRef.current.playerState, volume: Math.min(1, volume) } });
          } else if (command === 'getMuted' && typeof result === 'boolean') {
            publish('pagehide', { playerState: { ...latestRef.current.playerState, muted: result } });
          } else if (command === 'getPlaybackRate') {
            const rate = finite(result);
            if (rate !== null) publish('pagehide', { playerState: { ...latestRef.current.playerState, playbackRate: Math.max(0.25, Math.min(2, rate)) } });
          }
          break;
        }
        case 'cinesrc:close':
          requestFinalSnapshot('close');
          onBackRef.current();
          break;
        case 'cinesrc:error':
          setFailed(true);
          break;
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        requestFinalSnapshot('close');
        onBackRef.current();
      }
    };
    const onPageHide = () => requestFinalSnapshot('pagehide');
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') requestFinalSnapshot('pagehide');
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      requestFinalSnapshot('pagehide');
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tmdbId]);

  const backButton = (
    <button type="button" className="nf-player-back" onClick={() => { requestFinalSnapshot('close'); onBack(); }} aria-label="Back to browse">
      <ArrowLeft size={32} aria-hidden="true" />
    </button>
  );

  if (!embedUrl) {
    return (
      <div className="nf nf-player" role="alert">
        {backButton}
        <div className="nf-player-msg"><h2>This title can&apos;t be played</h2><p>It is missing a valid movie ID.</p></div>
      </div>
    );
  }

  return (
    <div className="nf nf-player">
      <iframe
        key={attempt}
        ref={frameRef}
        className="nf-player-frame"
        src={embedUrl}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => { setLoaded(true); setFailed(false); }}
      />
      {!loaded && !failed && <>{backButton}<span className="nf-spinner" role="status" aria-label="Loading" /></>}
      {failed && (
        <div className="nf-player-msg nf-player-error" role="alert">
          <h2>Playback error</h2>
          <p>We couldn&apos;t start this title. Please try again.</p>
          <div className="nf-player-error-actions">
            <button type="button" className="nf-btn play" onClick={() => { setFailed(false); setLoaded(false); setAttempt(value => value + 1); }}>Try again</button>
            <button type="button" className="nf-btn info" onClick={() => { requestFinalSnapshot('close'); onBack(); }}>Go back</button>
          </div>
        </div>
      )}
    </div>
  );
}
