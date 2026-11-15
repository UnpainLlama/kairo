import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Maximize2, Play, RefreshCw } from 'lucide-react';
import { useKairoAccount } from '../lib/AccountProvider';
import {
  VIDLINK_ORIGIN,
  vidlinkMovieEmbedUrl,
  type VidLinkPlayerType,
} from '../lib/moviePlayback';

type Props = {
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};
type LocalProgress = {
  progressSeconds: number;
  durationSeconds: number | null;
  updatedAt: number;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readLocalProgress(key: string): LocalProgress | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const progress = Number(value.progressSeconds);
    const updatedAt = Number(value.updatedAt);
    const duration = value.durationSeconds === null ? null : Number(value.durationSeconds);
    if (!Number.isFinite(progress) || progress < 0 || !Number.isFinite(updatedAt) ||
        (duration !== null && (!Number.isFinite(duration) || duration <= 0))) return null;
    return {
      progressSeconds: progress,
      durationSeconds: duration,
      updatedAt,
      title: typeof value.title === 'string' ? value.title.slice(0, 300) : '',
      posterUrl: typeof value.posterUrl === 'string' ? value.posterUrl : null,
      backdropUrl: typeof value.backdropUrl === 'string' ? value.backdropUrl : null,
    };
  } catch {
    return null;
  }
}

export default function MovieEmbedPlayer({ tmdbId, title, posterUrl, backdropUrl }: Props) {
  const account = useKairoAccount();
  const [playerType, setPlayerType] = useState<VidLinkPlayerType>('default');
  const [active, setActive] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const storageKey = useMemo(
    () => `kairo-movie-progress:${account.status === 'signed-in' ? account.accountId : 'guest'}:${tmdbId}`,
    [account.accountId, account.status, tmdbId],
  );
  const lastSyncAt = useRef(0);
  const lastSyncedPosition = useRef(0);

  const embedUrl = useMemo(() => {
    try {
      return vidlinkMovieEmbedUrl(tmdbId, playerType, startAt);
    } catch {
      return null;
    }
  }, [playerType, startAt, tmdbId]);

  const saveProgress = useCallback((
    progressSeconds: number,
    durationSeconds: number | null,
    eventName: string,
  ) => {
    if (!Number.isFinite(progressSeconds) || progressSeconds < 0 || progressSeconds > 86400) return;
    const duration = durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.min(86400, durationSeconds)
      : null;
    const position = duration ? Math.min(progressSeconds, duration) : progressSeconds;
    const entry: LocalProgress = {
      progressSeconds: position,
      durationSeconds: duration,
      updatedAt: Date.now(),
      title,
      posterUrl: posterUrl ?? null,
      backdropUrl: backdropUrl ?? null,
    };
    try { localStorage.setItem(storageKey, JSON.stringify(entry)); } catch { /* playback must continue if storage is full */ }

    if (account.status !== 'signed-in' || !account.accountId || position <= 0) return;
    const now = Date.now();
    const immediateEvent = eventName !== 'timeupdate';
    const shouldUpload = (immediateEvent && Math.abs(position - lastSyncedPosition.current) >= 1) ||
      now - lastSyncAt.current >= 15_000;
    if (!shouldUpload) return;
    lastSyncAt.current = now;
    lastSyncedPosition.current = position;
    void fetch('/api/v1/me/movies/history', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'tmdb',
        externalId: tmdbId,
        title,
        posterUrl,
        backdropUrl,
        progressSeconds: position,
        durationSeconds: duration,
      }),
    }).catch(() => {
      // Keep the newest local copy; the next pause/seek or later play will retry it.
    });
  }, [account.accountId, account.status, backdropUrl, posterUrl, storageKey, title, tmdbId]);

  useEffect(() => {
    let current = true;
    setResumeLoaded(false);
    setStartAt(0);
    lastSyncAt.current = 0;
    lastSyncedPosition.current = 0;
    if (account.status === 'loading' || account.status === 'unavailable') return () => { current = false; };
    const local = readLocalProgress(storageKey);
    const load = async () => {
      let best = local;
      let localNeedsSync = Boolean(local);
      if (account.status === 'signed-in') {
        try {
          const response = await fetch('/api/v1/me/movies/history', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          });
          const payload = await response.json().catch(() => null);
          if (response.ok && payload?.success && Array.isArray(payload.data?.items)) {
            const remote = payload.data.items.find((item: Record<string, unknown>) => String(item.externalId) === tmdbId);
            if (remote) {
              const serverEntry: LocalProgress = {
                progressSeconds: Number(remote.progressSeconds) || 0,
                durationSeconds: Number(remote.durationSeconds) > 0 ? Number(remote.durationSeconds) : null,
                updatedAt: Number(remote.updatedAt) || 0,
                title: typeof remote.title === 'string' ? remote.title : title,
                posterUrl: typeof remote.posterUrl === 'string' ? remote.posterUrl : posterUrl ?? null,
                backdropUrl: typeof remote.backdropUrl === 'string' ? remote.backdropUrl : backdropUrl ?? null,
              };
              if (!best || serverEntry.updatedAt >= best.updatedAt) {
                best = serverEntry;
                localNeedsSync = false;
              }
            }
          }
        } catch {
          // Local state remains available when the account service is offline.
        }
      }
      if (!current) return;
      if (best && best.progressSeconds > 0) {
        setStartAt(Math.min(86400, Math.floor(best.progressSeconds)));
        try { localStorage.setItem(storageKey, JSON.stringify(best)); } catch { /* optional browser cache */ }
        if (account.status === 'signed-in' && local && localNeedsSync) {
          void fetch('/api/v1/me/movies/history', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerId: 'tmdb', externalId: tmdbId, title,
              posterUrl, backdropUrl, progressSeconds: local.progressSeconds,
              durationSeconds: local.durationSeconds,
            }),
          }).catch(() => undefined);
        }
      }
      setResumeLoaded(true);
    };
    void load();
    return () => { current = false; };
  }, [account.status, account.accountId, backdropUrl, posterUrl, storageKey, title, tmdbId]);

  useEffect(() => {
    if (!active) return;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== VIDLINK_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      if (!isRecord(event.data)) return;

      if (event.data.type === 'MEDIA_DATA' && isRecord(event.data.data)) {
        try {
          localStorage.setItem(`kairo-vidlink-media-data:${account.status === 'signed-in' ? account.accountId : 'guest'}:${tmdbId}`, JSON.stringify(event.data.data));
        } catch { /* non-critical provider data */ }
        return;
      }
      if (event.data.type !== 'PLAYER_EVENT') return;
      const data = isRecord(event.data.data) ? event.data.data : event.data;
      const eventMovieId = data.mtmdbId ?? data.tmdbId;
      if (eventMovieId !== undefined && String(eventMovieId) !== tmdbId) return;
      if (typeof data.mediaType === 'string' && data.mediaType.toLowerCase() !== 'movie') return;
      const eventName = typeof data.event === 'string' ? data.event.toLowerCase() : '';
      if (!['timeupdate', 'play', 'pause', 'seeked', 'ended'].includes(eventName)) return;
      const currentTime = Number(data.currentTime);
      const duration = Number(data.duration);
      if (!Number.isFinite(currentTime) || currentTime < 0) return;
      saveProgress(currentTime, Number.isFinite(duration) && duration > 0 ? duration : null, eventName);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [account.accountId, account.status, active, saveProgress, tmdbId]);

  const start = useCallback(() => {
    if (!embedUrl || !resumeLoaded) return;
    setFrameLoaded(false);
    setFrameError(false);
    setActive(true);
  }, [embedUrl, resumeLoaded]);

  const reload = useCallback(() => {
    setFrameLoaded(false);
    setFrameError(false);
    setReloadKey(key => key + 1);
    setActive(true);
  }, []);

  const selectPlayer = useCallback((next: VidLinkPlayerType) => {
    setPlayerType(next);
    setFrameLoaded(false);
    setFrameError(false);
    setReloadKey(key => key + 1);
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
            <button type="button" className={playerType === 'default' ? 'mv-player-server active' : 'mv-player-server'} aria-pressed={playerType === 'default'} onClick={() => selectPlayer('default')}>VidLink</button>
            <button type="button" className={playerType === 'jw' ? 'mv-player-server active' : 'mv-player-server'} aria-pressed={playerType === 'jw'} onClick={() => selectPlayer('jw')}>JW Player</button>
          </div>
        </div>
        <div className="mv-player-toolbar-actions">
          <a className="mv-player-control" href={embedUrl} target="_blank" rel="noopener noreferrer" title="Open the official VidLink player in a new tab"><ExternalLink size={14} /> <span>Open direct</span></a>
          {active && <>
            <button type="button" className="mv-player-control" onClick={reload} title="Reload player"><RefreshCw size={14} /> <span>Reload</span></button>
            <button type="button" className="mv-player-control" onClick={enterFullscreen} title="Enter fullscreen"><Maximize2 size={14} /> <span>Fullscreen</span></button>
          </>}
        </div>
      </div>

      <div className="mv-player-frame-wrap" ref={frameWrapRef}>
        {!active ? (
          <button type="button" className="mv-player-start" onClick={start} aria-label={`Play ${title} with VidLink`} disabled={!resumeLoaded}>
            {(backdropUrl || posterUrl) && <span className="mv-player-start-backdrop" aria-hidden="true"><img src={backdropUrl || posterUrl || ''} alt="" /></span>}
            <span className="mv-player-start-shade" aria-hidden="true" />
            <span className="mv-player-start-kicker">KAIRO FILMS <i /> OFFICIAL VIDLINK PLAYER</span>
            <span className="mv-player-start-icon"><Play size={27} fill="currentColor" /></span>
            <span className="mv-player-start-copy"><b>{resumeLoaded ? (startAt > 0 ? `Resume ${title}` : `Play ${title}`) : 'Restoring your progress…'}</b><small>{resumeLoaded && startAt > 0 ? `Continue from ${Math.floor(startAt / 60)}:${String(Math.floor(startAt % 60)).padStart(2, '0')}` : 'Start the ' + (playerType === 'jw' ? 'JW Player' : 'VidLink') + ' embed'}</small></span>
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
        {!active ? (resumeLoaded ? 'Choose the VidLink player or JW Player, then press Play.' : 'Restoring your saved movie position…')
          : frameError ? 'The embedded player reported a loading error. Use Open direct to test VidLink outside the embedded frame.'
            : frameLoaded ? 'Playback progress is saved to your Kairo account when you are signed in.'
              : 'Connecting to VidLink…'}
      </p>
    </div>
  );
}
