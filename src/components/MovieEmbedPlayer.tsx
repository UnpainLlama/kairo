import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Play, RefreshCw } from 'lucide-react';
import {
  MOVIE_PLAYBACK_SERVERS,
  moviePlaybackEmbedUrl,
  type MoviePlaybackServerId,
} from '../lib/moviePlayback';

type Props = {
  /** TMDB numeric id (Movies catalogue externalId for provider tmdb). */
  tmdbId: string;
  title: string;
  /** Optional default server; falls back to first entry. */
  initialServer?: MoviePlaybackServerId;
};

/**
 * Movies iframe player.
 *
 * Mitigations (what actually helps without black-screening VidLink):
 * - Click-to-load: iframe is not mounted until the user presses Play, so
 *   popunders do not fire on mere page view.
 * - Tight allow= list (no top-navigation grants we can control from attrs).
 * - strict-origin-when-cross-origin referrer policy: sends the site origin to
 *   VidLink without exposing the full movie page URL.
 * - Parent-side window.open guard while the player is active (best-effort;
 *   cannot stop in-frame scripts that open new tabs after user gesture).
 *
 * Do not set sandbox — VidLink detects it and often refuses to play.
 */
export default function MovieEmbedPlayer({ tmdbId, title, initialServer }: Props) {
  const servers = MOVIE_PLAYBACK_SERVERS;
  const [serverId, setServerId] = useState<MoviePlaybackServerId>(
    initialServer && servers.some((s) => s.id === initialServer)
      ? initialServer
      : servers[0].id,
  );
  const [active, setActive] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

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
    setReloadKey((k) => k + 1);
    setActive(true);
  }, []);

  const switchServer = useCallback((id: MoviePlaybackServerId) => {
    setServerId(id);
    setActive(false);
    setReloadKey((k) => k + 1);
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
    <div className="mv-player-shell">
      <div className="mv-player-toolbar" role="toolbar" aria-label="Playback servers">
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
        {active && (
          <button type="button" className="mv-player-reload" onClick={reload} title="Reload player">
            <RefreshCw size={14} /> Reload
          </button>
        )}
      </div>

      <div className="mv-player-frame-wrap">
        {!active ? (
          <button type="button" className="mv-player-start" onClick={start} aria-label={`Play ${title}`}>
            <span className="mv-player-start-icon">
              <Play size={28} fill="currentColor" />
            </span>
            <span className="mv-player-start-copy">
              <b>Play with {servers.find((s) => s.id === serverId)?.label ?? 'server'}</b>
              <small>Player loads only after you press play — reduces auto pop-ups.</small>
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
        Third-party embeds may still show in-player ads. Full redirect blocking needs a
        same-origin proxy; sandbox is not used because it breaks this provider.
      </p>
    </div>
  );
}
