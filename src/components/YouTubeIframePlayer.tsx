import { useEffect, useRef, useState } from 'react';

type PlayerStateEvent = { data: number; target: YouTubePlayer };
type YouTubePlayer = {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
};
type YouTubeApi = {
  PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
  Player: new (host: HTMLElement, options: {
    videoId: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: { target: YouTubePlayer }) => void;
      onStateChange?: (event: PlayerStateEvent) => void;
      onError?: (event: { data: number }) => void;
    };
  }) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type YouTubeProgressReason = 'timeupdate' | 'pause' | 'ended' | 'pagehide';
type Props = {
  videoId: string;
  title: string;
  startSeconds?: number;
  onProgress?: (seconds: number, duration: number, completed: boolean, reason: YouTubeProgressReason) => void;
};

let apiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
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

export default function YouTubeIframePlayer({ videoId, title, startSeconds = 0, onProgress }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const onProgressRef = useRef(onProgress);
  const startSecondsRef = useRef(startSeconds);
  const restoredRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { startSecondsRef.current = startSeconds; }, [startSeconds]);

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
        onProgressRef.current?.(Math.max(0, seconds), duration, completed, reason);
      }
    };
    const startTimer = () => {
      stopTimer();
      timerRef.current = window.setInterval(() => report('timeupdate'), 10000);
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
      if (cancelled || !hostRef.current) return;
      const player = new api.Player(hostRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            playerRef.current = event.target;
            setReady(true);
            if (!restorePosition(event.target)) {
              let attempts = 0;
              resumeTimerRef.current = window.setInterval(() => {
                attempts += 1;
                if (restorePosition(event.target) || attempts >= 20) {
                  if (resumeTimerRef.current !== null) window.clearInterval(resumeTimerRef.current);
                  resumeTimerRef.current = null;
                }
              }, 500);
            }
          },
          onStateChange: (event) => {
            if (event.data === api.PlayerState.PLAYING) {
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
    window.addEventListener('pagehide', pageHide);
    return () => {
      cancelled = true;
      stopTimer();
      if (resumeTimerRef.current !== null) {
        window.clearInterval(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      report('pagehide');
      window.removeEventListener('pagehide', pageHide);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  return (
    <div className="yt-iframe-player">
      <div className="yt-iframe-host" ref={hostRef} aria-label={title} />
      {!ready && !error && <div className="yt-player-overlay" role="status">Loading YouTube player…</div>}
      {error && <div className="yt-player-overlay yt-player-error" role="alert">{error}</div>}
    </div>
  );
}
