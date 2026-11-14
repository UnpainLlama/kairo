import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Maximize2, Play, RefreshCw } from 'lucide-react';
import {
  VIDLINK_ORIGIN,
  vidlinkMovieEmbedUrl,
  type VidLinkPlayerType,
} from '../lib/moviePlayback';

type Props = {
  /** Numeric TMDB movie ID, supplied by the Movies catalogue. */
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Official VidLink iframe integration.
 *
 * The iframe is created only after a user click. Messages are accepted only
 * from the VidLink origin and this exact iframe; MEDIA_DATA is stored using
 * the key and shape described by VidLink's Continue Watching documentation.
 */
export default function MovieEmbedPlayer({ tmdbId, title, posterUrl, backdropUrl }: Props) {
  const [playerType, setPlayerType] = useState<VidLinkPlayerType>('default');
  const [active, setActive] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);

  const embedUrl = useMemo(() => {
    try {
      return vidlinkMovieEmbedUrl(tmdbId, playerType);
    } catch {
      return null;
    }
  }, [playerType, tmdbId]);

  useEffect(() => {
    if (!active) return;

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== VIDLINK_ORIGIN) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isRecord(event.data) || event.data.type !== 'MEDIA_DATA') return;
      if (!isRecord(event.data.data)) return;

      try {
        const serialized = JSON.stringify(event.data.data);
        if (serialized && serialized.length <= 100_000) {
          localStorage.setItem('vidLinkProgress', serialized);
        }
      } catch {
        // Playback must continue even when browser storage is unavailable.
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [active]);

  const start = useCallback(() => {
    if (!embedUrl) return;
    setFrameLoaded(false);
    setFrameError(false);
    setActive(true);
  }, [embedUrl]);

  const reload = useCallback(() => {
    setFrameLoaded(false);
    setFrameError(false);
    setReloadKey((key) => key + 1);
    setActive(true);
  }, []);

  const selectPlayer = useCallback((next: VidLinkPlayerType) => {
    setPlayerType(next);
    setFrameLoaded(false);
    setFrameError(false);
    setReloadKey((key) => key + 1);
    setActive(false);
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
          <p>VidLink requires a positive numeric TMDB movie ID. This title cannot be embedded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`mv-player-shell${active ? ' is-active' : ''}`}>
      <div className="mv-player-toolbar" role="toolbar" aria-label="VidLink playback options">
        <div className="mv-player-toolbar-source">
          <span className="mv-player-toolbar-label">PLAYER</span>
          <div className="mv-player-servers">
            <button
              type="button"
              className={playerType === 'default' ? 'mv-player-server active' : 'mv-player-server'}
              aria-pressed={playerType === 'default'}
              onClick={() => selectPlayer('default')}
            >
              VidLink
            </button>
            <button
              type="button"
              className={playerType === 'jw' ? 'mv-player-server active' : 'mv-player-server'}
              aria-pressed={playerType === 'jw'}
              onClick={() => selectPlayer('jw')}
            >
              JW Player
            </button>
          </div>
        </div>

        <div className="mv-player-toolbar-actions">
          <a
            className="mv-player-control"
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the official VidLink player in a new tab"
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
          <button type="button" className="mv-player-start" onClick={start} aria-label={`Play ${title} with VidLink`}>
            {(backdropUrl || posterUrl) && (
              <span className="mv-player-start-backdrop" aria-hidden="true">
                <img src={backdropUrl || posterUrl || ''} alt="" />
              </span>
            )}
            <span className="mv-player-start-shade" aria-hidden="true" />
            <span className="mv-player-start-kicker">KAIRO FILMS <i /> OFFICIAL VIDLINK PLAYER</span>
            <span className="mv-player-start-icon"><Play size={27} fill="currentColor" /></span>
            <span className="mv-player-start-copy">
              <b>Play {title}</b>
              <small>Start the {playerType === 'jw' ? 'JW Player' : 'VidLink'} embed</small>
            </span>
          </button>
        ) : (
          <iframe
            key={`${playerType}-${reloadKey}`}
            ref={frameRef}
            className="mv-player-frame"
            src={embedUrl}
            title={`${title} — VidLink ${playerType === 'jw' ? 'JW' : 'player'}`}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
            onLoad={() => { setFrameLoaded(true); setFrameError(false); }}
            onError={() => { setFrameError(true); setFrameLoaded(false); }}
          />
        )}
      </div>

      <p className="mv-player-note" role="status">
        {!active
          ? 'Choose the VidLink player or JW Player, then press Play.'
          : frameError
            ? 'The embedded player reported a loading error. Use Open direct to test VidLink outside the embedded frame.'
            : frameLoaded
              ? 'The VidLink player frame loaded. Stream availability is controlled by VidLink and its sources.'
              : 'Connecting to VidLink…'}
      </p>
    </div>
  );
}
