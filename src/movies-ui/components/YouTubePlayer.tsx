import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useYouTubeApi } from '../hooks/useYouTubeApi';

interface YouTubePlayerProps {
  videoKey: string;
  muted?: boolean;
  autoplay?: boolean;
  /** When true, calls pauseVideo() on the underlying player. Toggling back to
   *  false resumes playback. */
  paused?: boolean;
  onReady?: () => void;
  onPlaying?: () => void;
  onEnded?: () => void;
  onError?: () => void;
  /** Additional styles for the outer container */
  style?: CSSProperties;
  /** Fade duration in ms — player is hidden until PLAYING, then fades in */
  fadeDuration?: number;
}

let playerIdCounter = 0;

export function YouTubePlayer({
  videoKey,
  muted = true,
  autoplay = true,
  paused = false,
  onReady,
  onPlaying,
  onEnded,
  onError,
  style,
  fadeDuration = 500,
}: YouTubePlayerProps) {
  const { apiReady } = useYouTubeApi();
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const idRef = useRef(`yt-player-${++playerIdCounter}`);
  const [isPlaying, setIsPlaying] = useState(false);

  // Store latest callbacks in refs to avoid recreating player
  const cbRef = useRef({ onReady, onPlaying, onEnded, onError });
  cbRef.current = { onReady, onPlaying, onEnded, onError };

  // Create player when API is ready
  useEffect(() => {
    if (!apiReady || !containerRef.current || !videoKey) return;

    setIsPlaying(false);

    // Create a div for the player inside our container
    const el = document.createElement('div');
    el.id = idRef.current;
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(el);

    const player = new YT.Player(el, {
      videoId: videoKey,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        iv_load_policy: 3, // hide annotations
        modestbranding: 1,
        mute: muted ? 1 : 0,
        playsinline: 1,
        rel: 0,
        showinfo: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          cbRef.current.onReady?.();
        },
        onStateChange: (event: YT.PlayerEvent) => {
          if (event.data === YT.PlayerState.PLAYING) {
            setIsPlaying(true);
            cbRef.current.onPlaying?.();
          } else if (event.data === YT.PlayerState.ENDED) {
            cbRef.current.onEnded?.();
          }
        },
        onError: () => {
          cbRef.current.onError?.();
        },
      },
    });

    playerRef.current = player;

    return () => {
      try {
        player.destroy();
      } catch {
        // Player may already be destroyed
      }
      playerRef.current = null;
    };
  }, [apiReady, videoKey, autoplay]); // muted handled separately below

  // Respond to muted prop changes without recreating player
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (muted) {
        player.mute();
      } else {
        player.unMute();
      }
    } catch {
      // Player not ready yet
    }
  }, [muted]);

  // Respond to paused prop changes — drive the player imperatively. Wrapped in
  // try/catch since the player may not have finished initializing.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (paused) player.pauseVideo();
      else player.playVideo();
    } catch {
      // Player not ready yet
    }
  }, [paused]);

  // Fade the player out while paused so YouTube's native center play/pause
  // indicator never shows — the backdrop image (rendered as a sibling in the
  // hero section) shows through. Custom Pause/Play controls live in the
  // bottom-right of the hero, so this big-icon overlay was redundant and
  // distracting. Initial open already gates on isPlaying.
  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    opacity: isPlaying && !paused ? 1 : 0,
    transition: `opacity ${fadeDuration}ms ease-out`,
    ...style,
  };

  // Strategy: oversize the iframe so the YouTube title bar and bottom progress
  // strip are pushed outside the wrapper's overflow:hidden box. The top is
  // pulled up enough (-22%) that the title bar lands well above the visible
  // area on its own — no top mask needed. A short bottom mask still hides the
  // residual progress strip on the bottom edge.
  const iframeContainerStyle: CSSProperties = {
    position: 'absolute',
    top: '-22%',
    left: '-2%',
    width: '104%',
    height: '144%',
  };

  const bottomMaskStyle: CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '14%',
    background:
      'linear-gradient(0deg, #141414 0%, #141414 60%, rgba(20,20,20,0.4) 85%, transparent 100%)',
    pointerEvents: 'none',
    zIndex: 2,
  };

  return (
    <div style={wrapperStyle}>
      <div ref={containerRef} style={iframeContainerStyle} />
      <div style={bottomMaskStyle} />
    </div>
  );
}
