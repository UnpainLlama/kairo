import { type CSSProperties, memo, useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { theme } from '../styles/theme';
import { mergeStyles } from '../styles/styleEngine';
import { getTileImageUrl } from '../data/mockContent';
import { getTmdbBackdropUrl, getTmdbLogoUrl } from '../data/tmdb';
import { FocusRing } from './FocusRing';
import { YouTubePlayer } from './YouTubePlayer';
import { useTrailerPreview } from '../hooks/useTrailerPreview';
import { selectLastNavAction, selectTrailerMuted, selectTrailerPaused } from '../state/selectors';
import { setTileTrailerPlaying, setActiveTrailer } from '../state/slices/trailerSlice';
import { openDetail } from '../state/slices/uiSlice';
import { setTrailerPaused } from '../state/slices/trailerSlice';
import { useIsTvMode } from '../hooks/useMode';
import { useResponsive } from '../hooks/useResponsive';
import { useSettings } from '../hooks/useSettings';
import { useTvHint } from '../hooks/useTvHint';
import { getTmdbPosterUrl } from '../data/tmdb';
import type { TileData } from '../state/slices/contentSlice';
import type { NavigationAction } from '../engine/FocusEngine';
import { tileCounter } from '../utils/tileCounter';

function isImageCached(src: string): boolean {
  const img = new Image();
  img.src = src;
  return img.complete && img.naturalWidth > 0;
}

function TileLogo({ logoPath, logoOnRight, isFocused, fadeOut = false }: {
  logoPath: string;
  logoOnRight: boolean;
  isFocused: boolean;
  fadeOut?: boolean;
}) {
  const src = getTmdbLogoUrl(logoPath, 'w300');
  const cachedOnMount = useRef(isImageCached(src)).current;
  const [loaded, setLoaded] = useState(cachedOnMount);

  const style: CSSProperties = {
    position: 'absolute',
    bottom: 8,
    ...(logoOnRight ? { right: 8 } : { left: 8 }),
    maxWidth: '55%',
    maxHeight: '40%',
    objectFit: 'contain',
    filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))',
    opacity: fadeOut ? 0 : loaded ? (isFocused ? 1 : 0.8) : 0,
    transform: loaded ? 'scale(1)' : 'scale(0.92)',
    transition: cachedOnMount
      ? 'opacity 200ms ease-out'
      : `opacity ${theme.animation.trailerFadeMs}ms ease-out, transform 350ms ease-out`,
  };

  return (
    <img src={src} alt="" style={style} onLoad={() => setLoaded(true)} />
  );
}

function getTransformOrigin(action: NavigationAction | null): string {
  switch (action) {
    case 'LEFT': return 'right center';
    case 'RIGHT': return 'left center';
    case 'UP': return 'center bottom';
    case 'DOWN': return 'center top';
    default: return 'center center';
  }
}

/** Netflix-style hover info card (web mode) */
function WebTileInfo({ tile, visible }: { tile: TileData; visible: boolean }) {
  const genres = tile.genre.split(/,\s*/);
  const match = 75 + (parseInt(tile.id.replace(/\D/g, '') || '0', 10) % 24);

  const card: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(0deg, rgba(20,20,20,0.95) 0%, rgba(20,20,20,0.8) 60%, transparent 100%)',
    padding: '40px 10px 8px',
    opacity: visible ? 1 : 0,
    transition: 'opacity 200ms ease-out',
    pointerEvents: 'none',
    borderRadius: `0 0 ${theme.tile.borderRadius}px ${theme.tile.borderRadius}px`,
  };

  return (
    <div style={card}>
      <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: theme.typography.fontFamily }}>
        {tile.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: theme.typography.fontFamily }}>
        <span style={{ color: '#46d369', fontWeight: 600 }}>{match}%</span>
        <span style={{ border: '1px solid rgba(255,255,255,0.4)', padding: '0 3px', color: '#999', borderRadius: 2, fontSize: 9, lineHeight: '14px' }}>{tile.rating}</span>
        <span style={{ color: '#999' }}>{tile.year}</span>
      </div>
      <div style={{ fontSize: 9, color: '#888', marginTop: 3, fontFamily: theme.typography.fontFamily }}>
        {genres.slice(0, 3).join(' \u2022 ')}
      </div>
    </div>
  );
}

interface ContentTileProps {
  tile: TileData;
  tileIndex: number;
  isFocused: boolean;
  isRowFocused: boolean;
}

export const ContentTile = memo(function ContentTile({
  tile,
  tileIndex,
  isFocused,
  isRowFocused,
}: ContentTileProps) {
  const dispatch = useDispatch();
  const isTv = useIsTvMode();
  const { isMobile } = useResponsive();
  const settings = useSettings();
  const showTvHint = useTvHint();
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    tileCounter.mount();
    return () => tileCounter.unmount();
  }, []);

  const logoOnRight = tileIndex % 2 === 1;
  const lastNavAction = useSelector(selectLastNavAction);
  const trailerMuted = useSelector(selectTrailerMuted);
  const trailerPaused = useSelector(selectTrailerPaused);

  // In TV mode, use focus-based trailer preview. In web mode, use hover.
  // Disabled if user opted out of autoplay in settings.
  const effectiveFocused = !settings.disableAutoplay && (isTv ? isFocused : false);
  const { showTrailer, trailerKey } = useTrailerPreview(tile, effectiveFocused, trailerPaused);
  const [videoPlaying, setVideoPlaying] = useState(false);

  // Track the last nav action when this tile loses focus for directional shrink (TV only)
  const shrinkOriginRef = useRef<string>('center center');
  const wasFocusedRef = useRef(isFocused);

  useEffect(() => {
    if (wasFocusedRef.current && !isFocused) {
      shrinkOriginRef.current = getTransformOrigin(lastNavAction);
    }
    wasFocusedRef.current = isFocused;
  }, [isFocused, lastNavAction]);

  useEffect(() => {
    if (!showTrailer) {
      setVideoPlaying(false);
      dispatch(setTileTrailerPlaying(false));
      dispatch(setActiveTrailer(null));
    }
  }, [showTrailer, dispatch]);

  const handleClick = useCallback(() => {
    if (isTv) {
      showTvHint();
      return;
    }
    dispatch(openDetail(tile));
    dispatch(setTrailerPaused(true));
  }, [dispatch, tile, isTv, showTvHint]);

  const isTrailerActive = showTrailer && !!trailerKey;
  const trailerWidth = isTrailerActive ? theme.tile.width * 1.15 : theme.tile.width;
  const trailerHeight = isTrailerActive ? Math.round(trailerWidth * 9 / 16) : theme.tile.height;

  // Determine visual state
  const isHighlighted = isTv ? isFocused : hovered;
  const brightness = isHighlighted ? 1.1 : (isTv && isRowFocused) ? 0.7 : isTv ? 0.45 : 0.75;

  const containerStyle: CSSProperties = {
    width: theme.tile.width,
    height: theme.tile.height,
    flexShrink: 0,
    cursor: isTv ? 'default' : 'pointer',
    userSelect: 'none',
    overflow: 'visible',
    scrollSnapAlign: isTv ? undefined : 'start',
  };

  const imgStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: theme.tile.borderRadius,
    display: 'block',
    filter: `brightness(${brightness})`,
    transition: `filter ${theme.animation.focusDuration}ms ease-out, opacity ${theme.animation.trailerFadeMs}ms ease-out`,
    opacity: videoPlaying ? 0 : 1,
  };

  const transformOrigin = isFocused ? 'center center' : shrinkOriginRef.current;

  // Mobile mode: poster card
  if (!isTv && isMobile) {
    const POSTER_W = 110;
    const POSTER_H = 165;
    const posterSrc = tile.posterPath
      ? getTmdbPosterUrl(tile.posterPath)
      : (tile.backdropPath ? getTmdbBackdropUrl(tile.backdropPath) : getTileImageUrl(tile.imageIndex));

    return (
      <div
        style={{
          width: POSTER_W,
          height: POSTER_H,
          flexShrink: 0,
          cursor: 'pointer',
          borderRadius: 6,
          overflow: 'hidden',
          scrollSnapAlign: 'start',
        }}
        onClick={handleClick}
        aria-label={`${tile.title}, ${tile.year}`}
      >
        <img
          src={posterSrc}
          alt={tile.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy"
        />
      </div>
    );
  }

  // Web mode: simpler render with hover effects
  if (!isTv) {
    const webScale = hovered ? 1.08 : 1;
    const wrapperStyle: CSSProperties = {
      transition: `transform 200ms ease-out, box-shadow 200ms ease-out`,
      transform: `scale(${webScale})`,
      zIndex: hovered ? 10 : 1,
      position: 'relative',
      boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.7)' : 'none',
      borderRadius: theme.tile.borderRadius,
    };

    // Subtle staggered entrance on first mount. Cap the stagger at 12 tiles so
    // late items don't feel sluggish — they all settle within ~700ms.
    const enterDelay = Math.min(tileIndex, 12) * 30;
    const entranceStyle: CSSProperties = {
      animation: `tile-in 360ms cubic-bezier(0.22, 1, 0.36, 1) ${enterDelay}ms both`,
    };

    return (
      <div
        style={mergeStyles(containerStyle, entranceStyle)}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={`${tile.title}, ${tile.year}, ${tile.rating}`}
      >
        <div style={wrapperStyle}>
          <div style={{
            position: 'relative',
            width: theme.tile.width,
            height: theme.tile.height,
            borderRadius: theme.tile.borderRadius,
            overflow: 'hidden',
          }}>
            <img
              src={tile.backdropPath ? getTmdbBackdropUrl(tile.backdropPath) : getTileImageUrl(tile.imageIndex)}
              alt={tile.title}
              style={imgStyle}
              loading="lazy"
            />
            {tile.logoPath && (
              <TileLogo logoPath={tile.logoPath} logoOnRight={logoOnRight} isFocused={hovered} />
            )}
            <WebTileInfo tile={tile} visible={hovered} />
          </div>
        </div>
      </div>
    );
  }

  // TV mode: focus ring + trailer. Click triggers hint toast.
  return (
    <div
      style={{ ...containerStyle, cursor: 'pointer' }}
      role="gridcell"
      aria-selected={isFocused}
      aria-label={`${tile.title}, ${tile.year}, ${tile.rating}`}
      onClick={handleClick}
    >
      <FocusRing
        isFocused={isFocused}
        scale={isTrailerActive ? theme.animation.trailerScale : undefined}
        transformOrigin={transformOrigin}
      >
        <div style={{
          position: 'relative',
          width: trailerWidth,
          height: trailerHeight,
          borderRadius: theme.tile.borderRadius,
          overflow: 'hidden',
          transition: `width ${theme.animation.trailerFadeMs}ms ease-out, height ${theme.animation.trailerFadeMs}ms ease-out`,
        }}>
          <img
            src={tile.backdropPath ? getTmdbBackdropUrl(tile.backdropPath) : getTileImageUrl(tile.imageIndex)}
            alt={tile.title}
            style={imgStyle}
            loading="lazy"
          />
          {isTrailerActive && (
            <YouTubePlayer
              videoKey={trailerKey!}
              muted={trailerMuted}
              autoplay={true}
              onPlaying={() => {
                setVideoPlaying(true);
                dispatch(setTileTrailerPlaying(true));
                dispatch(setActiveTrailer('tile'));
              }}
              onEnded={() => setVideoPlaying(false)}
              onError={() => setVideoPlaying(false)}
              style={{ borderRadius: theme.tile.borderRadius }}
            />
          )}
          {tile.logoPath && (
            <TileLogo logoPath={tile.logoPath} logoOnRight={logoOnRight} isFocused={isFocused} fadeOut={videoPlaying} />
          )}
          {videoPlaying && (
            <div style={{
              position: 'absolute', bottom: 6, right: 6, padding: '3px 7px',
              borderRadius: 3, background: 'rgba(0,0,0,0.6)', color: '#fff',
              fontSize: 10, fontWeight: 500, opacity: 0.7, pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
              zIndex: 3, // above the YouTube chrome mask (zIndex 2)
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 12, height: 12, padding: '0 3px', borderRadius: 2,
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                fontSize: 9, fontWeight: 600,
              }}>P</span>
              <span style={{ fontFamily: theme.typography.fontFamily }}>to pause</span>
            </div>
          )}
        </div>
      </FocusRing>
    </div>
  );
});
