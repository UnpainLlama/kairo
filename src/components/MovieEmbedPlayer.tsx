import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Maximize2, Play, RefreshCw } from 'lucide-react';
import {
  MOVIE_PLAYBACK_SERVERS,
  moviePlaybackEmbedUrl,
  type MoviePlaybackServerId,
} from '../lib/moviePlayback';

type Props = {
  /** TMDB numeric id (Movies catalogue externalId for provider tmdb). */
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  /** Optional default server; falls back to first entry. */
  initialServer?: MoviePlaybackServerId;
};

/**
 * Movies iframe player. The source is loaded only after an explicit Play click,
 * preserving the existing click-to-load protection against unwanted pop-ups.
 */
export default function MovieEmbedPlayer({ tmdbId, title, posterUrl, backdropUrl, initialServer }: Props) {
  const servers = MOVIE_PLAYBACK_SERVERS;
  const [serverId, setServerId] = useState<MoviePlaybackServerId>(
    initialServer && servers.some((server) => server.id === initialServer)
      ? initialServer
      : servers[0].id,
  );
  const [active, setActive] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);

  const embedUrl = useMemo(() => {
    try {
      return moviePlaybackEmbedUrl(serverId, tmdbId);
    } catch {
      return null;
    }
  }, [serverId, tmdbId]);

  // Best-effort: while player is active, block window.open from this page context.
  // Cross-origin frame scripts still control their own browsing context.
  useEffect(() => {
    if (!active) return;
    const originalOpen = window.open;
    window.open = function blockedOpen(..._args: Parameters<typeof window.open>) {
      return null;
    } as typeof window.open;
    return () => {
      window.open = originalOpen;
    };
  }, [active]);

  const start = useCallback(() => {
    if (!embedUrl) return;
    setActive(true);
  }, [embedUrl]);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
    setActive(true);
  }, []);

  const switchServer = useCallback((id: MoviePlaybackServerId) => {
    setServerId(id);
    setActive(false);
    setReloadKey((key) => key + 1);
  }, []);

  const enterFullscreen = useCallback(() => {
    const target = frameWrapRef.current;
    if (target?.requestFullscreen) {
      void target.requestFullscreen().catch(() => {
        frameRef.current?.focus();
      });
    } else {
      frameRef.current?.focus();
    }
  }, []);

  if (!embedUrl) {
    return (
      <div className="mv-player-shell" role="alert">
        <div className="mv-player-message">
          <AlertTriangle size={18} />
          <p>This film does not have a playable TMDB id for embeds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`mv-player-shell${active ? ' is-active' : ''}`}>
      <div className="mv-player-toolbar" role="toolbar" aria-label="Playback options">
        <div className="mv-player-toolbar-source">
          <span className="mv-player-toolbar-label">SOURCE</span>
          <div className="mv-player-servers">
            {servers.map((server) => (
              <button
                key={server.id}
                type="button"
                className={server.id === serverId ? 'mv-player-server active' : 'mv-player-server'}
                aria-pressed={server.id === serverId}
                onClick={() => switchServer(server.id)}
              >
                {server.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mv-player-toolbar-actions">
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
          <button type="button" className="mv-player-start" onClick={start} aria-label={`Play ${title}`}>
            {(backdropUrl || posterUrl) && (
              <span className="mv-player-start-backdrop" aria-hidden="true">
                <img src={backdropUrl || posterUrl || ''} alt="" />
              </span>
            )}
            <span className="mv-player-start-shade" aria-hidden="true" />
            <span className="mv-player-start-kicker">KAIRO FILMS <i /> READY TO WATCH</span>
            <span className="mv-player-start-icon"><Play size={27} fill="currentColor" /></span>
            <span className="mv-player-start-copy">
              <b>Play {title}</b>
              <small>Start playback on {servers.find((server) => server.id === serverId)?.label ?? 'the selected source'}</small>
            </span>
          </button>
        ) : (
          <iframe
            key={`${serverId}-${reloadKey}`}
            ref={frameRef}
            className="mv-player-frame"
            src={embedUrl}
            title={`${title} — ${serverId} player`}
            allow="fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
          />
        )}
      </div>

      <p className="mv-player-note">
        Playback is hosted by {servers.find((server) => server.id === serverId)?.label ?? 'the selected source'}.
        Available video, audio and subtitle options depend on the source.
      </p>
    </div>
  );
}
