import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAccountScope } from '../hooks/useAccountScope';
import { ApiError, apiGet } from '../lib/api';
import MovieEmbedPlayer from '../components/MovieEmbedPlayer';
import { loadMovieProgressForMovie } from '../lib/movieProgress';
import { writeMovieProgress } from '../lib/movieProgressStorage';
import type { MovieDetail } from '../lib/movies';
import '../styles-netflix.css';

export default function MoviesWatchPage() {
  const { externalId = '' } = useParams();
  const navigate = useNavigate();
  const { accountId, resolved: accountResolved, error: accountError } = useAccountScope();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [initialTime, setInitialTime] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLocalSaveAt = useRef(0);
  const lastRemoteSaveAt = useRef(0);

  useEffect(() => {
    if (!accountResolved && !accountError) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setMovie(null);
    setInitialTime(0);
    lastLocalSaveAt.current = 0;
    lastRemoteSaveAt.current = 0;

    const load = async () => {
      try {
        const result = await apiGet<MovieDetail>('/movies/' + encodeURIComponent(externalId), controller.signal);
        const progress = accountError
          ? null
          : await loadMovieProgressForMovie(accountId, result, controller.signal);
        if (controller.signal.aborted) return;
        setMovie(result);
        setInitialTime(progress && !progress.completed ? progress.currentTime : 0);
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'MOVIES_UNAVAILABLE', 'Could not load this title.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [externalId, accountId, accountResolved, accountError]);

  const saveProgress = useCallback((
    currentTime: number,
    duration: number,
    completed: boolean,
    reason: 'timeupdate' | 'pause' | 'ended' | 'pagehide',
  ) => {
    if (accountError || !movie || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (reason === 'timeupdate' && now - lastLocalSaveAt.current < 5000) return;
    const position = Math.max(0, Math.min(duration, currentTime));
    if (position < 2 && !completed) return;
    lastLocalSaveAt.current = now;
    const progress = {
      currentTime: completed ? duration : position,
      duration,
      completed,
      updatedAt: now,
    };
    writeMovieProgress(accountId, movie, progress);

    if (!accountId) return;
    if (reason === 'timeupdate' && now - lastRemoteSaveAt.current < 15000) return;
    lastRemoteSaveAt.current = now;
    void fetch('/api/v1/me/movies/progress', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: movie.providerId,
        externalId: movie.externalId,
        currentTime: progress.currentTime,
        duration: progress.duration,
        completed: progress.completed,
        updatedAt: progress.updatedAt,
      }),
      keepalive: reason === 'pagehide' || reason === 'ended',
    }).then(async response => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? 'Could not sync movie progress.');
    }).catch(() => {
      // Keep the local timestamped position. A later pause or playback update retries the sync.
      lastRemoteSaveAt.current = 0;
    });
  }, [accountId, accountError, movie]);

  // Back returns to wherever the viewer came from, and falls back to the title page for direct links.
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate('/movies/' + encodeURIComponent(externalId), { replace: true });
  };

  if (loading) return <div className="nf nf-player"><span className="nf-spinner" role="status" aria-label="Loading" /></div>;

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
        <div className="nf-player-msg"><h2>This title can’t be played</h2><p>It is not available for playback.</p><button type="button" className="nf-btn play" onClick={back}>Go back</button></div>
      </div>
    );
  }

  return (
    <>
      {accountError && <p className="nf-progress-warning" role="status">Account status is unavailable. Playback will continue, but progress syncing is paused until the account can be verified.</p>}
      <MovieEmbedPlayer
        tmdbId={movie.externalId}
        title={movie.title}
        initialTime={initialTime}
        onProgress={saveProgress}
        onBack={back}
      />
    </>
  );
}
