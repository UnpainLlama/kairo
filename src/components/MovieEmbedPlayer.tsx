import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Maximize2, Play, RefreshCw } from 'lucide-react';
import {
  EMBEDWAVE_SERVERS,
  embedWaveMovieEmbedUrl,
  type EmbedWaveServerId,
} from '../lib/moviePlayback';

type Props = {
  /** Numeric TMDB movie ID, supplied by the Movies catalogue. */
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

type SelectedServer = 'auto' | EmbedWaveServerId;

const PLAYER_OPTIONS: { id: SelectedServer; label: string }[] = [
  { id: 'auto', label: 'Automatic' },
  ...EMBEDWAVE_SERVERS,
];

/**
 * EmbedWave movie iframe.
 *
 * The iframe mounts only after an explicit Play click. No sandbox attribute is
 * used: the embedded provider needs its own scripts and playback controls.
 */
export default function MovieEmbedPlayer({ tmdbId, title, posterUrl, backdropUrl }: Props) {
  const [server, setServer] = useState<SelectedServer>('auto');
  const [active, setActive] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);

  const embedUrl = useMemo(() => {
    try {
      return embedWaveMovieEmbedUrl(tmdbId, server === 'auto' ? undefined : server);
    } catch {
      return null;
    }
  }, [server, tmdbId]);

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

  const selectServer = useCallback((next: SelectedServer) => {
    setServer(next);
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
          <p>EmbedWave requires a positive numeric TMDB movie ID. This title cannot be embedded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`mv-player-shell${active ? ' is-active' : ''}`}>
      <div className="mv-player-toolbar" role="toolbar" aria-label="EmbedWave playback options">
        <div className="mv-player-toolbar-source">
          <span className="mv-player-toolbar-label">SERVER</span>
          <div className="mv-player-servers">
            {PLAYER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === server ? 'mv-player-server active' : 'mv-player-server'}
                aria-pressed={option.id === server}
                onClick={() => selectServer(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mv-player-toolbar-actions">
          <a
            className="mv-player-control"
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the EmbedWave player in a new tab"
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
          <button type="button" className="mv-player-start" onClick={start} aria-label={`Play ${title} with EmbedWave`}>
            {(backdropUrl || posterUrl) && (
              <span className="mv-player-start-backdrop" aria-hidden="true">
                <img src={backdropUrl || posterUrl || ''} alt="" />
              </span>
            )}
            <span className="mv-player-start-shade" aria-hidden="true" />
            <span className="mv-player-start-kicker">KAIRO FILMS <i /> EMBEDWAVE PLAYER</span>
            <span className="mv-player-start-icon"><Play size={27} fill="currentColor" /></span>
            <span className="mv-player-start-copy">
              <b>Play {title}</b>
              <small>Start with {PLAYER_OPTIONS.find((option) => option.id === server)?.label ?? 'Automatic'} server</small>
            </span>
          </button>
        ) : (
          <iframe
            key={`${server}-${reloadKey}`}
            ref={frameRef}
            className="mv-player-frame"
            src={embedUrl}
            title={`${title} — EmbedWave player`}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="no-referrer"
            loading="eager"
            onLoad={() => { setFrameLoaded(true); setFrameError(false); }}
            onError={() => { setFrameError(true); setFrameLoaded(false); }}
          />
        )}
      </div>

      <p className="mv-player-note" role="status">
        {!active
          ? 'Choose a server or leave Automatic selected, then press Play.'
          : frameError
            ? 'The browser reported an iframe loading error. Use Open direct to test EmbedWave outside KAIRO.'
            : frameLoaded
              ? 'The EmbedWave frame loaded. Actual stream availability depends on its upstream sources.'
              : 'Connecting to EmbedWave…'}
      </p>
    </div>
  );
}
