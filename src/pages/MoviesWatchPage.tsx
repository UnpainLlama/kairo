import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiError, apiGet } from '../lib/api';
import MovieEmbedPlayer from '../components/MovieEmbedPlayer';
import type { MovieDetail } from '../lib/movies';
import '../styles-netflix.css';

export default function MoviesWatchPage() {
  const { externalId = '' } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

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
          <h2>{error?.code === 'MOVIES_DISABLED' ? 'Movies are not available yet' : 'We can\u2019t play this title right now'}</h2>
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

  return <MovieEmbedPlayer tmdbId={movie.externalId} title={movie.title} posterUrl={movie.posterUrl} backdropUrl={movie.backdropUrl} onBack={back} />;
}
