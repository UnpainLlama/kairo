import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CINESRC_ORIGIN, cinesrcMovieEmbedUrl } from '../lib/moviePlayback';
import '../styles-netflix.css';

type Props = {
  /** Numeric TMDB movie ID, supplied by the Movies catalogue. */
  tmdbId: string;
  title: string;
  onBack: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Full-screen CineSrc player. It starts as soon as the page opens, like pressing Play on Netflix.
 * CineSrc draws its own controls and back button (back=close). Messages are accepted only from the
 * CineSrc origin and this exact iframe.
 */
export default function MovieEmbedPlayer({ tmdbId, title, onBack }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const embedUrl = useMemo(() => {
    try { return cinesrcMovieEmbedUrl(tmdbId); } catch { return null; }
  }, [tmdbId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== CINESRC_ORIGIN) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isRecord(event.data) || typeof event.data.type !== 'string') return;
      if (event.data.type === 'cinesrc:close') onBack();
      else if (event.data.type === 'cinesrc:ready') { setLoaded(true); setFailed(false); }
      else if (event.data.type === 'cinesrc:error') setFailed(true);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.fullscreenElement) onBack(); };
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('message', onMessage); window.removeEventListener('keydown', onKey); };
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
