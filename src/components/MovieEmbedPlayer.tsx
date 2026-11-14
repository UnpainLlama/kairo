import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Maximize2, Play, RefreshCw } from 'lucide-react';
import {
  CINESRC_ORIGIN,
  cinesrcMovieEmbedUrl,
} from '../lib/moviePlayback';

type Props = {
  /** Numeric TMDB movie ID, supplied by the Movies catalogue. */
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

type CineSrcMessage = {
  type?: unknown;
  currentTime?: unknown;
  duration?: unknown;
  sourceId?: unknown;
  error?: unknown;
};

function isRecord(value: unknown): value is CineSrcMessage {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * CineSrc movie iframe. The provider is loaded directly from cinesrc.st
 * after an explicit Play click; it is not routed through EmbedWave.
 *
 * Player messages are accepted only from CineSrc and this exact iframe.
 */
export default function MovieEmbedPlayer({ tmdbId, title, posterUrl, backdropUrl }: Props) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [frameError, setFrameError] = useState('');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sourceUsed, setSourceUsed] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);

  const embedUrl = useMemo(() => {
    try {
      return cinesrcMovieEmbedUrl(tmdbId);
    } catch {
      return null;
    }
  }, [tmdbId]);

  useEffect(() => {
    if (!active) return;

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== CINESRC_ORIGIN) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isRecord(event.data) || typeof event.data.type !== 'string') return;

      switch (event.data.type) {
        case 'cinesrc:ready':
          setStatus('ready');
          setFrameError('');
          break;
        case 'cinesrc:play':
          setStatus('playing');
          break;
        case 'cinesrc:pause':
          setStatus('paused');
          break;
        case 'cinesrc:ended':
          setStatus('ended');
          break;
        case 'cinesrc:timeupdate': {
          const current = validTime(event.data.currentTime);
          const total = validTime(event.data.duration);
          if (current !== null) setPlaybackTime(current);
          if (total !== null) setDuration(total);
          break;
        }
        case 'cinesrc:loadedmetadata': {
          const total = validTime(event.data.duration);
          if (total !== null) setDuration(total);
          break;
        }
        case 'cinesrc:sourceused':
          if (typeof event.data.sourceId === 'string') setSourceUsed(event.data.sourceId);
          break;
        case 'cinesrc:error':
          setStatus('error');
          setFrameError(
            typeof event.data.error === 'string' && event.data.error.trim()
              ? event.data.error.slice(0, 240)
              : 'CineSrc reported a playback error.',
          );
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [active]);

  const start = useCallback(() => {
    if (!embedUrl) return;
    setStatus('loading');
    setFrameError('');
    setPlaybackTime(0);
    setDuration(0);
    setSourceUsed('');
    setActive(true);
  }, [embedUrl]);

  const reload = useCallback(() => {
    setStatus('loading');
    setFrameError('');
    setPlaybackTime(0);
    setDuration(0);
    setSourceUsed('');
    setReloadKey((key) => key + 1);
    setActive(true);
  }, []);

  const enterFullscreen = useCallback(() => {
    const target = frameWrapRef.current;
    if (target?.requestFullscreen) {
      void target.requestFullscreen().catch(() => frameRef.current?.focus());
    } else {
      frameRef.current?.focus();
    }
  }, []);

  if (!embedUrl) {
    return (
      <div className="mv-player-shell" role="alert">
        <div className="mv-player-message">
          <AlertTriangle size={18} />
          <p>CineSrc requires a positive numeric TMDB movie ID. This title cannot be embedded.</p>
        </div>
      </div>
    );
  }

  const statusText = frameError
    ? frameError
    : status === 'loading'
      ? 'Connecting directly to CineSrc…'
      : status === 'ready'
        ? 'CineSrc player ready'
        : status === 'playing'
          ? 'Playing on CineSrc'
          : status === 'paused'
            ? 'Playback paused'
            : status === 'ended'
              ? 'Playback ended'
              : 'The CineSrc player loads directly from cinesrc.st.';

  return (
    <div className={`mv-player-shell${active ? ' is-active' : ''}`}>
      <div className="mv-player-toolbar" role="toolbar" aria-label="CineSrc playback options">
        <div className="mv-player-toolbar-source">
          <span className="mv-player-toolbar-label">SOURCE</span>
          <span className="mv-player-server active" aria-label="Direct provider">CineSrc direct</span>
        </div>
        <div className="mv-player-toolbar-actions">
          <a
            className="mv-player-control"
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the direct CineSrc player in a new tab"
          >
            <ExternalLink size={14} /> <span>Open direct</span>
          </a>
          {active && (
            <>
              <button type="button" className="mv-player-control" onClick={reload} title="Reload player">
                <RefreshCw size={14} /> <span>Reload</span>
              </button>
              <button type="button" className="mv-player-control" onClick={enterFullscreen} title="Enter fullscreen">
                <Maximize2 size={14} /> <span>Fullscreen</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mv-player-frame-wrap" ref={frameWrapRef}>
        {!active ? (
          <button type="button" className="mv-player-start" onClick={start} aria-label={`Play ${title} with CineSrc`}>
            {(backdropUrl || posterUrl) && (
              <span className="mv-player-start-backdrop" aria-hidden="true">
                <img src={backdropUrl || posterUrl || ''} alt="" />
              </span>
            )}
            <span className="mv-player-start-shade" aria-hidden="true" />
            <span className="mv-player-start-kicker">KAIRO FILMS <i /> CINESRC DIRECT PLAYER</span>
            <span className="mv-player-start-icon"><Play size={27} fill="currentColor" /></span>
            <span className="mv-player-start-copy">
              <b>Play {title}</b>
              <small>Load the direct CineSrc movie embed</small>
            </span>
          </button>
        ) : (
          <iframe
            key={reloadKey}
            ref={frameRef}
            className="mv-player-frame"
            src={embedUrl}
            title={`${title} — CineSrc player`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="eager"
            onLoad={() => setStatus((current) => current === 'loading' ? 'ready' : current)}
            onError={() => {
              setStatus('error');
              setFrameError('The browser reported an error loading the CineSrc iframe. Use Open direct to test the provider separately.');
            }}
          />
        )}
      </div>

      <div className="mv-player-note" role="status">
        <span>{statusText}</span>
        {duration > 0 && (
          <span>{formatTime(playbackTime)} / {formatTime(duration)}</span>
        )}
        {sourceUsed && <span>Source: {sourceUsed}</span>}
      </div>
    </div>
  );
}
