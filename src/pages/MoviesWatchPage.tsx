import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import MovieEmbedPlayer from '../components/MovieEmbedPlayer';
import { useAccountScope } from '../hooks/useAccountScope';
import { loadMediaPlayback, syncMediaPlayback, writeLocalMediaPlayback, type MediaPlaybackSnapshot } from '../lib/mediaPlayback';
import { PLAYBACK_SERVER_SYNC_INTERVAL_MS, type PlaybackSaveReason } from '../lib/playbackSync';
import type { MovieDetail } from '../lib/movies';
import '../styles-netflix.css';

export default function MoviesWatchPage() {
  const { externalId = '' } = useParams();
  const navigate = useNavigate();
  const { accountId, resolved: accountResolved, error: accountError } = useAccountScope();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [playbackState, setPlaybackState] = useState<MediaPlaybackSnapshot | null>(null);
  const [playbackReady, setPlaybackReady] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLocalSaveAt = useRef(0);
  const lastRemoteSaveAt = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setMovie(null);
    apiGet<MovieDetail>('/movies/' + encodeURIComponent(externalId), controller.signal)
      .then(result => { if (!controller.signal.aborted) setMovie(result); })
      .catch(caught => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load this title.'));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [externalId]);

  useEffect(() => {
    let active = true;
    setPlaybackReady(false);
    setPlaybackState(null);
    if (!accountResolved || accountError || !movie || movie.providerId !== 'tmdb') return () => { active = false; };
    void loadMediaPlayback(accountId, 'movie', movie.externalId).then(snapshot => {
      if (!active) return;
      setPlaybackState(snapshot);
      lastRemoteSaveAt.current = snapshot?.updatedAt ?? 0;
      lastLocalSaveAt.current = 0;
      setPlaybackReady(true);
    });
    return () => { active = false; };
  }, [accountId, accountResolved, accountError, movie?.externalId, movie?.providerId]);

  const persistPlayback = useCallback((incoming: MediaPlaybackSnapshot, reason: PlaybackSaveReason) => {
    if (reason === 'open' || !movie) return;
    const now = Date.now();
    const snapshot: MediaPlaybackSnapshot = {
      ...incoming,
      mediaType: 'movie',
      mediaKey: movie.externalId,
      title: movie.title,
      artworkUrl: movie.posterUrl,
      updatedAt: now,
    };
    setPlaybackState(snapshot);
    if (reason !== 'timeupdate' || now - lastLocalSaveAt.current >= 5000) {
      writeLocalMediaPlayback(accountId, snapshot);
      lastLocalSaveAt.current = now;
    }
    const shouldSend = reason !== 'timeupdate' || now - lastRemoteSaveAt.current >= PLAYBACK_SERVER_SYNC_INTERVAL_MS;
    if (shouldSend) {
      lastRemoteSaveAt.current = now;
      void syncMediaPlayback(accountId, snapshot, reason === 'pagehide' || reason === 'ended' || reason === 'close');
    }
  }, [accountId, movie]);

  // Back returns to wherever the viewer came from, and falls back to the title page for direct links.
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate('/movies/' + encodeURIComponent(externalId), { replace: true });
  };

  if (loading || (movie && !playbackReady && !accountError)) {
    return <div className="nf nf-player"><span className="nf-spinner" role="status" aria-label="Loading" /></div>;
  }

  if (accountError) {
    return <div className="nf nf-player" role="alert"><div className="nf-player-msg"><h2>Account status unavailable</h2><p>Reconnect to Kairo before opening the player so local progress is not saved under the wrong account.</p><button type="button" className="nf-btn play" onClick={() => window.location.reload()}>Retry</button></div></div>;
  }

  if (error || !movie) {
    return (
      <div className="nf nf-player" role="alert">
        <div className="nf-player-msg">
          <h2>{error?.code === 'MOVIES_DISABLED' ? 'Movies are not available yet' : 'We can’t play this title right now'}</h2>
          <p>{error?.message ?? 'The title may have been removed or is temporarily unavailable.'}</p>
          <Link to="/movies" className="nf-btn play"><ArrowLeft size={18} aria-hidden="true" /> Back to Browse</Link>
        </div>
      </div>
    );
  }

  if (movie.providerId !== 'tmdb') {
    return (
      <div className="nf nf-player" role="alert">
        <div className="nf-player-msg"><h2>This title can&apos;t be played</h2><p>It is not available for playback.</p><button type="button" className="nf-btn play" onClick={back}>Go back</button></div>
      </div>
    );
  }

  return (
    <MovieEmbedPlayer
      tmdbId={movie.externalId}
      title={movie.title}
      posterUrl={movie.posterUrl}
      initialPlayback={playbackState}
      onProgress={persistPlayback}
      onBack={back}
    />
  );
}
