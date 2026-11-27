import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CINESRC_ORIGIN, cinesrcMovieEmbedUrl } from '../lib/moviePlayback';
import { PLAYER_IFRAME_SANDBOX } from '../lib/playerSandbox';
import '../styles-netflix.css';

type Props = {
  /** Numeric TMDB movie ID, supplied by the Movies catalogue. */
  tmdbId: string;
  title: string;
  onBack: () => void;
  initialTime?: number;
  onProgress?: (currentTime: number, duration: number, completed: boolean, reason: 'timeupdate' | 'pause' | 'ended' | 'pagehide') => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Full-screen CineSrc player. It starts as soon as the page opens, like pressing Play on Netflix.
 * CineSrc draws its own controls and back button (back=close). Messages are accepted only from the
 * CineSrc origin and this exact iframe.
 */
export default function MovieEmbedPlayer({ tmdbId, title, onBack, initialTime = 0, onProgress }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const latestProgress = useRef<{ currentTime: number; duration: number; completed: boolean } | null>(null);
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);

  const embedUrl = useMemo(() => {
    try { return cinesrcMovieEmbedUrl(tmdbId, initialTime); } catch { return null; }
  }, [tmdbId, initialTime]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== CINESRC_ORIGIN) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isRecord(event.data) || typeof event.data.type !== 'string') return;
      const data = event.data;
      if (data.type === 'cinesrc:close') onBack();
      else if (data.type === 'cinesrc:ready') { setLoaded(true); setFailed(false); }
      else if (data.type === 'cinesrc:error') setFailed(true);
      else if (data.type === 'cinesrc:timeupdate' || data.type === 'cinesrc:pause' || data.type === 'cinesrc:ended') {
        const current = typeof data.currentTime === 'number' && Number.isFinite(data.currentTime)
          ? data.currentTime : latestProgress.current?.currentTime;
        const duration = typeof data.duration === 'number' && Number.isFinite(data.duration)
          ? data.duration : latestProgress.current?.duration;
        if (current === undefined || current === null || duration === undefined || duration === null || duration <= 0) return;
        const completed = data.type === 'cinesrc:ended' || Boolean(latestProgress.current?.completed) || current >= duration - Math.max(30, duration * 0.02);
        latestProgress.current = { currentTime: Math.max(0, Math.min(duration, current)), duration, completed };
        const reason = data.type === 'cinesrc:pause' ? 'pause' : data.type === 'cinesrc:ended' ? 'ended' : 'timeupdate';
        onProgressRef.current?.(latestProgress.current.currentTime, duration, completed, reason);
      }
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement) onBack(); };
    const flushProgress = () => {
      flushProgress();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushProgress();
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', flushProgress);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', flushProgress);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const progress = latestProgress.current;
      if (progress) onProgressRef.current?.(progress.currentTime, progress.duration, progress.completed, 'pagehide');
    };
  }, [onBack]);

  const backButton = (
    <button type="button" className="nf-player-back" onClick={onBack} aria-label="Back to browse"><ArrowLeft size={32} aria-hidden="true" /></button>
  );

  if (!embedUrl) {
    return (
      <div className="nf nf-player" role="alert">
        {backButton}
        <div className="nf-player-msg"><h2>This title can&apos;t be played</h2><p>It is missing a valid movie ID.</p></div>
      </div>
    );
  }

  return (
    <div className="nf nf-player">
      <iframe
        key={attempt}
        ref={frameRef}
        className="nf-player-frame"
        src={embedUrl}
        title={title}
        sandbox={PLAYER_IFRAME_SANDBOX}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="origin"
        onLoad={() => { setLoaded(true); setFailed(false); }}
      />
      {!loaded && !failed && <>{backButton}<span className="nf-spinner" role="status" aria-label="Loading" /></>}
      {failed && (
        <div className="nf-player-msg nf-player-error" role="alert">
          <h2>Playback error</h2>
          <p>We couldn&apos;t start this title. Please try again.</p>
          <div className="nf-player-error-actions">
            <button type="button" className="nf-btn play" onClick={() => { setFailed(false); setLoaded(false); setAttempt(value => value + 1); }}>Try again</button>
            <button type="button" className="nf-btn info" onClick={onBack}>Go back</button>
          </div>
        </div>
      )}
    </div>
  );
}
