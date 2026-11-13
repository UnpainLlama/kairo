import { memo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectDetailOverlay, selectWatchlist, selectTrailerMuted, selectCurrentProfileId, selectIsLiked } from '../state/selectors';
import { closeDetail } from '../state/slices/uiSlice';
import { toggleWatchlist } from '../state/slices/watchlistSlice';
import { toggleLike } from '../state/slices/likesSlice';
import { setTrailerPaused, toggleTrailerMute } from '../state/slices/trailerSlice';
import { getTileImageUrl } from '../data/mockContent';
import { getTmdbBackdropUrl, getTmdbLogoUrl } from '../data/tmdb';
import { fetchTrailerKey, fetchTvSeasons, fetchEpisodes } from '../data/tmdb';
import { overlayStyles } from '../styles/componentStyles/overlayStyles';
import { mergeStyles } from '../styles/styleEngine';
import { YouTubePlayer } from './YouTubePlayer';
import { EpisodeBrowser } from './EpisodeBrowser';
import { useIsTvMode, useIsWebMode } from '../hooks/useMode';
import { useSettings } from '../hooks/useSettings';
import { theme } from '../styles/theme';
import type { CSSProperties } from 'react';

export const DetailOverlay = memo(function DetailOverlay() {
  const dispatch = useDispatch();
  const { open, tile, buttonIndex, zone, seasonIndex, episodeIndex } = useSelector(selectDetailOverlay);
  const watchlist = useSelector(selectWatchlist);
  const trailerMuted = useSelector(selectTrailerMuted);
  const currentProfileId = useSelector(selectCurrentProfileId);
  const settings = useSettings();
  const isTv = useIsTvMode();
  const isWeb = useIsWebMode();
  const inList = !!tile && watchlist.some((t) => t.id === tile.id);
  const isLiked = useSelector(selectIsLiked(tile?.id ?? ''));
  const BUTTONS = settings.disableMyList
    ? ['Play', 'Like']
    : ['Play', inList ? 'Remove from List' : 'Add to List', 'Like'];

  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [, setVideoPlaying] = useState(false);
  // Local pause state for the detail-view trailer. We don't reuse the global
  // `trailerPaused` flag because that one suppresses tile/hero trailers and
  // would default this player to paused on open. Reset to false whenever a
  // new trailer key arrives so a freshly opened panel auto-plays.
  const [detailPaused, setDetailPaused] = useState(false);
  useEffect(() => { setDetailPaused(false); }, [trailerKey]);

  // TV mode: when focus climbs back up into the action-buttons zone (the
  // top of the page, inside the hero), restore the page scroll to 0 so the
  // hero comes back into view. EpisodeBrowser only auto-scrolls for the
  // 'episodes' and 'seasons' zones, so without this, climbing UP from
  // seasons → buttons leaves the page stuck at the season-tabs offset and
  // the user never sees the hero again.
  const tvScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!isTv || !open) return;
    if (zone === 'buttons' && tvScrollRef.current) {
      tvScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [isTv, open, zone]);

  useEffect(() => {
    if (!open || !tile?.tmdbId || !tile?.mediaType || settings.disableAutoplay) {
      setTrailerKey(null);
      setVideoPlaying(false);
      return;
    }
    let cancelled = false;
    fetchTrailerKey(tile.tmdbId, tile.mediaType).then((key) => {
      if (!cancelled) setTrailerKey(key);
    });
    return () => { cancelled = true; };
  }, [open, tile?.tmdbId, tile?.mediaType, settings.disableAutoplay]);

  // Pre-warm season + first season's episode caches when opening a TV show overlay,
  // so the input navigation handler can synchronously read counts and switch zones.
  useEffect(() => {
    if (!open || !tile?.tmdbId || tile.mediaType !== 'tv') return;
    let cancelled = false;
    const tvId = tile.tmdbId;
    fetchTvSeasons(tvId).then((seasons) => {
      if (cancelled || seasons.length === 0) return;
      // Also pre-fetch the first season's episodes
      fetchEpisodes(tvId, seasons[0].seasonNumber);
    });
    return () => { cancelled = true; };
  }, [open, tile?.tmdbId, tile?.mediaType]);

  const handleClose = useCallback(() => {
    dispatch(closeDetail());
    dispatch(setTrailerPaused(false));
  }, [dispatch]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (isWeb && e.target === e.currentTarget) {
      handleClose();
    }
  }, [isWeb, handleClose]);

  const handleToggleList = useCallback(() => {
    if (!isWeb || !tile || !currentProfileId) return;
    dispatch(toggleWatchlist({ profileId: currentProfileId, tile }));
  }, [dispatch, isWeb, tile, currentProfileId]);

  const handleToggleLike = useCallback(() => {
    if (!isWeb || !tile || !currentProfileId) return;
    dispatch(toggleLike({ profileId: currentProfileId, tileId: tile.id }));
  }, [dispatch, isWeb, tile, currentProfileId]);

  // Web mode: close on Escape
  useEffect(() => {
    if (!isWeb || !open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isWeb, open, handleClose]);

  if (!open || !tile) return null;

  const backdropSrc = tile.backdropPath
    ? getTmdbBackdropUrl(tile.backdropPath, 'w1280')
    : getTileImageUrl(tile.imageIndex);
  const logoSrc = tile.logoPath ? getTmdbLogoUrl(tile.logoPath, 'w500') : null;
  const match = 75 + (parseInt(tile.id.replace(/\D/g, '') || '0', 10) % 24);
  const genres = tile.genre.split(/,\s*/);
  const isTvShow = tile.mediaType === 'tv';

  // --- TV MODE: Full-screen takeover ---
  if (isTv) {
    const fullscreen: CSSProperties = {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: theme.colors.background,
      overflowY: 'auto',
      overflowX: 'hidden',
    };

    const heroSection: CSSProperties = {
      position: 'relative',
      width: '100%',
      height: '50vh',
      overflow: 'hidden',
    };

    const gradient: CSSProperties = {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '70%',
      background: `linear-gradient(180deg, transparent 0%, ${theme.colors.background} 100%)`,
      pointerEvents: 'none',
    };

    const gradientLeft: CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: '50%',
      background: theme.colors.gradientLeft,
      pointerEvents: 'none',
      zIndex: 1,
    };

    const infoContainer: CSSProperties = {
      position: 'absolute',
      bottom: 40,
      left: 48,
      maxWidth: 500,
      zIndex: 2,
    };

    return (
      <div ref={tvScrollRef} style={fullscreen} role="dialog" aria-label={`Details for ${tile.title}`}>
        {/* Hero with trailer */}
        <div style={heroSection}>
          <img src={backdropSrc} alt={tile.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {trailerKey && (
            <YouTubePlayer
              videoKey={trailerKey}
              muted={trailerMuted}
              autoplay={true}
              onPlaying={() => setVideoPlaying(true)}
              onEnded={() => setVideoPlaying(false)}
              onError={() => setVideoPlaying(false)}
              fadeDuration={600}
            />
          )}
          <div style={gradientLeft} />
          <div style={gradient} />
          <div style={infoContainer}>
            {logoSrc ? (
              <img src={logoSrc} alt={tile.title} style={{ maxWidth: 300, maxHeight: 100, marginBottom: 16, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))' }} />
            ) : (
              <div style={{ color: '#fff', fontSize: 36, fontWeight: 700, marginBottom: 16, textShadow: '0 2px 8px rgba(0,0,0,0.7)', fontFamily: theme.typography.fontFamily }}>{tile.title}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 12, fontFamily: theme.typography.fontFamily }}>
              <span style={{ color: '#46d369', fontWeight: 600 }}>{match}% Match</span>
              <span style={{ color: theme.colors.textSecondary }}>{tile.year}</span>
              <span style={{ border: '1px solid rgba(255,255,255,0.4)', padding: '1px 6px', fontSize: 12, color: theme.colors.textSecondary, borderRadius: 3 }}>{tile.rating}</span>
            </div>
            <div style={{ color: '#fff', fontSize: 14, lineHeight: 1.5, opacity: 0.9, marginBottom: 20, fontFamily: theme.typography.fontFamily }}>
              {tile.synopsis}
            </div>
            {/* Action buttons — only highlight when the buttons zone has focus */}
            <div style={{ display: 'flex', gap: 12 }}>
              {BUTTONS.map((label, i) => (
                <button
                  key={label}
                  style={overlayStyles.button(zone === 'buttons' && i === buttonIndex)}
                  tabIndex={-1}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Genre tags */}
        <div style={{ padding: '16px 48px 8px', fontFamily: theme.typography.fontFamily }}>
          <span style={{ color: theme.colors.textMuted, fontSize: 13 }}>Genres: </span>
          <span style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
            {genres.join(' \u2022 ')}
          </span>
        </div>

        {/* Episode browser for TV shows. focusedZone is set ONLY when the user is
            actually navigating that zone — passing null hides ALL focus rings inside
            the browser (e.g., when focus is on the action buttons up top). */}
        {isTvShow && tile.tmdbId && (
          <EpisodeBrowser
            tvId={tile.tmdbId}
            isTv={true}
            focusedZone={zone === 'seasons' ? 'seasons' : zone === 'episodes' ? 'episodes' : null}
            focusedSeason={seasonIndex}
            focusedEpisode={episodeIndex}
          />
        )}
      </div>
    );
  }

  // --- WEB MODE: Centered modal ---
  // Smooth, compositor-driven entrance: backdrop fades in; panel scales +
  // fades in; inner sections stagger in just behind the panel.
  const backdropAnim: CSSProperties = {
    animation: 'overlay-backdrop-in 240ms ease-out both',
  };
  const panelAnim: CSSProperties = {
    animation: 'overlay-panel-in 340ms cubic-bezier(0.22, 1, 0.36, 1) both',
    transformOrigin: 'center center',
    willChange: 'transform, opacity',
  };
  // For TV shows we lock the panel to its final size up front. Episode lists
  // can be tall enough to push the panel to its maxHeight (90vh) once data
  // arrives — that growth is the visible jerk at the end of the entrance. By
  // pinning to 90vh from t=0 the panel never resizes; only the inner content
  // hydrates. Movies render synchronously and don't need this.
  const panelSize: CSSProperties = isTvShow
    ? { minHeight: '90vh', height: '90vh' }
    : {};
  const itemAnim = (delayMs: number): CSSProperties => ({
    animation: `overlay-item-in 380ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms both`,
  });

  return (
    <div
      style={mergeStyles(overlayStyles.backdrop, backdropAnim)}
      role="dialog"
      aria-label={`Details for ${tile.title}`}
      onClick={handleBackdropClick}
    >
      <div style={mergeStyles(overlayStyles.panel, panelSize, panelAnim)}>
        {/* Close button */}
        <button style={overlayStyles.closeButton} onClick={handleClose} aria-label="Close">
          {'\u2715'}
        </button>

        {/* Hero section */}
        <div style={mergeStyles(overlayStyles.heroSection, itemAnim(80))}>
          <img src={backdropSrc} alt={tile.title} style={overlayStyles.heroImage} />
          {trailerKey && (
            <YouTubePlayer
              videoKey={trailerKey}
              muted={trailerMuted}
              autoplay={true}
              paused={detailPaused}
              onPlaying={() => setVideoPlaying(true)}
              onEnded={() => setVideoPlaying(false)}
              onError={() => setVideoPlaying(false)}
              fadeDuration={600}
            />
          )}
          <div style={overlayStyles.heroGradient} />
          <div style={overlayStyles.heroOverlay}>
            {logoSrc ? (
              <img src={logoSrc} alt={tile.title} style={overlayStyles.heroLogo} />
            ) : (
              <div style={overlayStyles.heroTitle}>{tile.title}</div>
            )}
          </div>
          {/* Trailer controls — only show while a trailer is loaded. Bottom-
              right corner of the hero, custom because the YT iframe has
              pointer-events disabled and native controls are off. */}
          {trailerKey && (
            <div style={overlayStyles.trailerControls}>
              <button
                type="button"
                className="detail-icon-btn detail-icon-btn--small"
                onClick={() => setDetailPaused((p) => !p)}
                aria-label={detailPaused ? 'Play trailer' : 'Pause trailer'}
                title={detailPaused ? 'Play trailer' : 'Pause trailer'}
              >
                {detailPaused ? <PlayGlyph /> : <PauseGlyph />}
              </button>
              <button
                type="button"
                className="detail-icon-btn detail-icon-btn--small"
                onClick={() => dispatch(toggleTrailerMute())}
                aria-label={trailerMuted ? 'Unmute trailer' : 'Mute trailer'}
                title={trailerMuted ? 'Unmute trailer' : 'Mute trailer'}
              >
                {trailerMuted ? <MutedGlyph /> : <SoundGlyph />}
              </button>
            </div>
          )}
        </div>

        {/* Info section */}
        <div style={mergeStyles(overlayStyles.infoSection, itemAnim(160))}>
          <div style={overlayStyles.infoLeft}>
            <div style={overlayStyles.metaRow}>
              <span style={overlayStyles.matchBadge}>{match}% Match</span>
              <span style={overlayStyles.yearText}>{tile.year}</span>
              <span style={overlayStyles.ratingBadge}>{tile.rating}</span>
            </div>
            <div style={overlayStyles.synopsis}>{tile.synopsis}</div>
          </div>
          <div style={overlayStyles.infoRight}>
            <div style={overlayStyles.genreLabel}>Genres:</div>
            <div style={overlayStyles.genreList}>
              {genres.map((g, i) => (
                <span key={g}>
                  {i > 0 && <span style={overlayStyles.genreDot}>{' \u2022 '}</span>}
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons — Play stays rectangular; My List + Like are
            circular icon buttons whose fill state reflects the user's data. */}
        <div style={mergeStyles(overlayStyles.buttonsRow, itemAnim(220))}>
          <button
            type="button"
            style={overlayStyles.playButton}
            tabIndex={0}
            onClick={() => {/* play wiring TBD */}}
            aria-label="Play"
          >
            <PlayIcon />
            <span>Play</span>
          </button>
          {!settings.disableMyList && (
            <IconCircleButton
              active={inList}
              onClick={handleToggleList}
              ariaLabel={inList ? 'Remove from My List' : 'Add to My List'}
            >
              {inList ? <CheckIcon /> : <PlusIcon />}
            </IconCircleButton>
          )}
          <IconCircleButton
            active={isLiked}
            onClick={handleToggleLike}
            ariaLabel={isLiked ? 'Remove like' : 'Like this title'}
          >
            <ThumbUpIcon filled={isLiked} />
          </IconCircleButton>
        </div>

        {/* Episode browser for TV shows (web mode) */}
        {isTvShow && tile.tmdbId && (
          <div style={itemAnim(280)}>
            <EpisodeBrowser tvId={tile.tmdbId} isTv={false} />
          </div>
        )}
      </div>
    </div>
  );
});

// --- Circular icon button with hover state ---------------------------------

interface IconCircleButtonProps {
  active: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}

function IconCircleButton({ active, ariaLabel, onClick, children }: IconCircleButtonProps) {
  // Hover and focus styles are owned by CSS (.detail-icon-btn:hover /
  // :focus-visible in GlobalStyles). React doesn't track hover here — that
  // was the source of stuck-hover bugs when the inner icon swapped on click
  // and the mouseleave event got dropped during the re-render.
  return (
    <button
      type="button"
      className={`detail-icon-btn${active ? ' is-active' : ''}`}
      tabIndex={0}
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {children}
    </button>
  );
}

// --- Inline icons -----------------------------------------------------------

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 3.5v17a1 1 0 0 0 1.55.83l13-8.5a1 1 0 0 0 0-1.66l-13-8.5A1 1 0 0 0 5 3.5z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4v16a1 1 0 0 0 1.55.83l13-8a1 1 0 0 0 0-1.66l-13-8A1 1 0 0 0 6 4z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function SoundGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
      />
      <path
        d="M16 8.5a4 4 0 0 1 0 7M19 6a7 7 0 0 1 0 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MutedGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
      />
      <path
        d="M16 9l5 5M21 9l-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ThumbUpIcon({ filled }: { filled: boolean }) {
  // Single path renders as outline (stroke-only) or filled depending on state.
  const d =
    'M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3zm3 0V6.5A2.5 2.5 0 0 1 12.5 4 1.5 1.5 0 0 1 14 5.5V10h5.2a2 2 0 0 1 1.98 2.28l-1.05 7A2 2 0 0 1 18.15 21H10V10z';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}
