import { useEffect, useRef, useState } from 'react';
import type { SavedPlayerState } from '../lib/mediaPlayback';
import type { PlaybackSaveReason } from '../lib/playbackSync';

type PlayerStateEvent = { data: number; target: YouTubePlayer };
type YouTubePlayer = {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getVolume(): number;
  isMuted(): boolean;
  getPlaybackRate(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  setPlaybackRate(rate: number): void;
};
type YouTubeApi = {
  PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
  Player: new (host: HTMLElement, options: {
    videoId?: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: { target: YouTubePlayer }) => void;
      onStateChange?: (event: PlayerStateEvent) => void;
      onError?: (event: { data: number }) => void;
      onPlaybackRateChange?: (event: { data: number; target: YouTubePlayer }) => void;
    };
  }) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type YouTubeProgressReason = PlaybackSaveReason;
type Props = {
  videoId: string;
  title: string;
  startSeconds?: number;
  onProgress?: (seconds: number, duration: number, completed: boolean, reason: YouTubeProgressReason, playerState?: SavedPlayerState) => void;
  initialPlayerState?: SavedPlayerState | null;
};


let apiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    let settled = false;
    let timeout = 0;
    const finish = () => {
      if (settled) return;
      if (!window.YT?.Player) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(window.YT);
    };
    window.onYouTubeIframeAPIReady = () => {
      try { previousReady?.(); } catch { /* preserve the player API callback */ }
      finish();
    };
    timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      apiPromise = null;
      reject(new Error('The YouTube player took too long to load.'));
    }, 15000);
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        apiPromise = null;
        reject(new Error('The YouTube player could not be loaded.'));
      };
      document.head.appendChild(script);
    }
    finish();
  });
  return apiPromise;
}

export default function YouTubeIframePlayer({ videoId, title, startSeconds = 0, onProgress, initialPlayerState }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const onProgressRef = useRef(onProgress);
  const startSecondsRef = useRef(startSeconds);
  const playerStateRef = useRef(initialPlayerState);
  const restoredRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { startSecondsRef.current = startSeconds; }, [startSeconds]);
  useEffect(() => { playerStateRef.current = initialPlayerState; }, [initialPlayerState]);

  useEffect(() => {
    let cancelled = false;
    const stopTimer = () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    const report = (reason: YouTubeProgressReason, completed = false) => {
      const player = playerRef.current;
      if (!player) return;
      const seconds = player.getCurrentTime();
      const duration = player.getDuration();
      if (Number.isFinite(seconds) && Number.isFinite(duration) && duration > 0) {
        const playerState: SavedPlayerState = {};
        const volume = player.getVolume();
        const playbackRate = player.getPlaybackRate();
        if (Number.isFinite(volume)) playerState.volume = Math.max(0, Math.min(1, volume / 100));
        playerState.muted = player.isMuted();
        if (Number.isFinite(playbackRate)) playerState.playbackRate = Math.max(0.25, Math.min(2, playbackRate));
        onProgressRef.current?.(Math.max(0, seconds), duration, completed, reason, playerState);
      }
    };
    const startTimer = () => {
      stopTimer();
      timerRef.current = window.setInterval(() => report('timeupdate'), 5000);
    };
    const restorePosition = (target: YouTubePlayer): boolean => {
      if (restoredRef.current) return true;
      const duration = target.getDuration();
      if (!Number.isFinite(duration) || duration <= 0) return false;
      const saved = startSecondsRef.current;
      if (saved > 15 && saved < duration - 15) target.seekTo(saved, true);
      restoredRef.current = true;
      return true;
    };



    void loadYouTubeIframeApi().then((api) => {
      if (cancelled || !iframeRef.current) return;
      // Attach to our own iframe so sandbox restrictions are present in markup before its first navigation.
      const player = new api.Player(iframeRef.current, {
        events: {
          onReady: (event) => {
            if (cancelled) return;
            playerRef.current = event.target;
            setReady(true);
            const savedState = playerStateRef.current;
            if (typeof savedState?.volume === 'number') event.target.setVolume(Math.round(savedState.volume * 100));
            if (typeof savedState?.muted === 'boolean') { if (savedState.muted) event.target.mute(); else event.target.unMute(); }
            if (typeof savedState?.playbackRate === 'number') event.target.setPlaybackRate(savedState.playbackRate);
            if (!restorePosition(event.target)) {
              let attempts = 0;
              resumeTimerRef.current = window.setInterval(() => {
                attempts += 1;
                if (restorePosition(event.target) || attempts >= 20) {
                  if (restorePosition(event.target)) report('open');
                  if (resumeTimerRef.current !== null) window.clearInterval(resumeTimerRef.current);
                  resumeTimerRef.current = null;
                }
              }, 500);
            } else {
              report('open');
            }
          },
          onStateChange: (event) => {
            if (event.data === api.PlayerState.PLAYING) {
              report('play');
              if (!restorePosition(event.target) && resumeTimerRef.current === null) {
                let attempts = 0;
                resumeTimerRef.current = window.setInterval(() => {
                  attempts += 1;
                  if (restorePosition(event.target) || attempts >= 20) {
                    if (resumeTimerRef.current !== null) window.clearInterval(resumeTimerRef.current);
                    resumeTimerRef.current = null;
                  }
                }, 500);
              }
              startTimer();
            }
            else if (event.data === api.PlayerState.PAUSED) {
              stopTimer();
              report('pause');
            } else if (event.data === api.PlayerState.ENDED) {
              stopTimer();
              report('ended', true);
            } else if (event.data === api.PlayerState.BUFFERING || event.data === api.PlayerState.CUED) {
              stopTimer();
            }
          },
          onPlaybackRateChange: () => report('ratechange'),
          onError: (event) => {
            stopTimer();
            const messages: Record<number, string> = {
              2: 'YouTube rejected this video ID.',
              5: 'This video could not be played in the embedded player.',
              100: 'This video is unavailable, private or deleted.',
              101: 'YouTube does not allow this video to play in an embedded player. This can be due to the owner’s setting or a YouTube platform/content restriction.',
              150: 'YouTube does not allow this video to play in an embedded player. This can be due to the owner’s setting or a YouTube platform/content restriction.',
              153: 'YouTube did not receive the required HTTP Referer identifying this site. Check the page referrer policy, then try again or open the video on YouTube.',
            };
            setError(messages[event.data] ?? 'YouTube could not play this video. Open it on YouTube instead.');
          },
        },
      });
      playerRef.current = player;
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'The YouTube player could not be loaded.');
    });

    const pageHide = () => report('pagehide');
    const visibilityChange = () => { if (document.visibilityState === 'hidden') report('pagehide'); };
    window.addEventListener('pagehide', pageHide);
    document.addEventListener('visibilitychange', visibilityChange);
    return () => {
      cancelled = true;
      stopTimer();
      if (resumeTimerRef.current !== null) {
        window.clearInterval(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      report('pagehide');
      window.removeEventListener('pagehide', pageHide);
      document.removeEventListener('visibilitychange', visibilityChange);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  return (
    <div className="yt-iframe-player">
      <div className="yt-iframe-host" aria-label={title}>
        <iframe
          key={videoId}
          ref={iframeRef}
          className="yt-iframe-frame"
          title={title}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&playsinline=1&rel=0`}
        />
      </div>
      {!ready && !error && <div className="yt-player-overlay" role="status">Loading YouTube player…</div>}
      {error && <div className="yt-player-overlay yt-player-error" role="alert">{error}</div>}
    </div>
  );
}
