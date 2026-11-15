import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Maximize2, Play, RefreshCw } from 'lucide-react';
import { VIDLINK_ORIGIN, vidlinkMovieEmbedUrl, type VidLinkPlayerType } from '../lib/moviePlayback';
import '../styles-netflix.css';

type Props = {
  /** Numeric TMDB movie ID, supplied by the Movies catalogue. */
  tmdbId: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  onBack: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Full-screen player with a Netflix-style top bar that fades away while you watch.
 * The VidLink iframe is created only after a click. Messages are accepted only from the
 * VidLink origin and this exact iframe; MEDIA_DATA is stored under VidLink's documented key.
 */
export default function MovieEmbedPlayer({ tmdbId, title, posterUrl, backdropUrl, onBack }: Props) {
  const [playerType, setPlayerType] = useState<VidLinkPlayerType>('default');
  const [active, setActive] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [barVisible, setBarVisible] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const embedUrl = useMemo(() => {
    try { return vidlinkMovieEmbedUrl(tmdbId, playerType); } catch { return null; }
  }, [playerType, tmdbId]);

  const wake = useCallback(() => {
    setBarVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBarVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (!active) { setBarVisible(true); window.clearTimeout(timer.current); return; }
    wake();
    return () => window.clearTimeout(timer.current);
  }, [active, wake]);

  useEffect(() => {
    if (!active) return;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== VIDLINK_ORIGIN) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isRecord(event.data) || event.data.type !== 'MEDIA_DATA') return;
      if (!isRecord(event.data.data)) return;
      try {
        const serialized = JSON.stringify(event.data.data);
        if (serialized && serialized.length <= 100_000) localStorage.setItem('vidLinkProgress', serialized);
      } catch {
        // Playback must continue even when browser storage is unavailable.
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [active]);

  const start = () => { if (embedUrl) { setFrameLoaded(false); setFrameError(false); setActive(true); } };
  const reload = () => { setFrameLoaded(false); setFrameError(false); setReloadKey(key => key + 1); setActive(true); };
  const selectPlayer = (next: VidLinkPlayerType) => { setPlayerType(next); setFrameLoaded(false); setFrameError(false); setReloadKey(key => key + 1); setActive(false); };
  const fullscreen = () => {
    const target = shellRef.current;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (target?.requestFullscreen) void target.requestFullscreen().catch(() => undefined);
  };

  const bar = (
    <div className={'nf-player-top' + (barVisible ? ' show' : '')}>
      <button type="button" className="nf-player-back" onClick={onBack} aria-label="Back to browse"><ArrowLeft size={30} aria-hidden="true" /></button>
      <span className="nf-player-name">{title}</span>
      <div className="nf-player-tools" role="toolbar" aria-label="Playback options">
        <button type="button" aria-pressed={playerType === 'default'} onClick={() => selectPlayer('default')}>Player 1</button>
        <button type="button" aria-pressed={playerType === 'jw'} onClick={() => selectPlayer('jw')}>Player 2</button>
        {active && <button type="button" onClick={reload} aria-label="Reload player" title="Reload"><RefreshCw size={18} aria-hidden="true" /></button>}
        {embedUrl && <a href={embedUrl} target="_blank" rel="noopener noreferrer" aria-label="Open player in a new tab" title="Open in a new tab"><ExternalLink size={18} aria-hidden="true" /></a>}
        <button type="button" onClick={fullscreen} aria-label="Full screen" title="Full screen"><Maximize2 size={18} aria-hidden="true" /></button>
      </div>
    </div>
  );

  if (!embedUrl) {
    return (
      <div className="nf nf-player" role="alert">
        {bar}
        <div className="nf-player-msg"><h2>This title can&apos;t be played</h2><p>It is missing a valid movie ID.</p></div>
      </div>
    );
  }

  return (
    <div className="nf nf-player" ref={shellRef} onMouseMove={active ? wake : undefined} onTouchStart={active ? wake : undefined} onKeyDown={active ? wake : undefined}>
      {!active ? (
        <button type="button" className="nf-player-start" onClick={start} aria-label={'Play ' + title}>
          {(backdropUrl || posterUrl) && <img src={backdropUrl || posterUrl || ''} alt="" referrerPolicy="no-referrer" />}
          <span className="nf-player-start-fade" />
          <span className="nf-player-start-icon"><Play size={44} fill="currentColor" aria-hidden="true" /></span>
        </button>
      ) : (
        <>
          <iframe
            key={playerType + '-' + reloadKey}
            ref={frameRef}
            className="nf-player-frame"
            src={embedUrl}
            title={title}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
            onLoad={() => { setFrameLoaded(true); setFrameError(false); }}
            onError={() => { setFrameError(true); setFrameLoaded(false); }}
          />
          {!frameLoaded && !frameError && <span className="nf-spinner" role="status" aria-label="Loading" />}
          {frameError && <div className="nf-player-msg" role="alert"><h2>Playback error</h2><p>Try the other player from the top bar.</p></div>}
          <div className={'nf-player-zone' + (barVisible ? ' off' : '')} onMouseEnter={wake} onMouseMove={wake} />
        </>
      )}
      {bar}
    </div>
  );
}
