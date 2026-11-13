import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { theme } from '../styles/theme';
import { getHeroImageUrl } from '../data/mockContent';
import { getTmdbBackdropUrl, getTmdbLogoUrl, fetchTrailerKey } from '../data/tmdb';
import { heroStyles } from '../styles/componentStyles/heroStyles';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { easeOutQuint } from '../engine/easing';
import {
  selectFocus, selectRows, selectTrailerMuted, selectTrailerPaused,
  selectHeroFocused, selectHeroButtonIndex, selectTileTrailerPlaying, selectNavFocused,
} from '../state/selectors';
import { setActiveTrailer } from '../state/slices/trailerSlice';
import { openDetail } from '../state/slices/uiSlice';
import { toggleWatchlist } from '../state/slices/watchlistSlice';
import { setTrailerPaused } from '../state/slices/trailerSlice';
import { selectCurrentProfileId } from '../state/selectors';
import { YouTubePlayer } from './YouTubePlayer';
import { useIsTvMode } from '../hooks/useMode';
import { useSettings } from '../hooks/useSettings';
import { useTvHint } from '../hooks/useTvHint';

const HERO_BUTTONS = ['▶  Play', '+ Add to List'];

export const HeroBanner = memo(function HeroBanner() {
  const dispatch = useDispatch();
  const isTv = useIsTvMode();
  const currentProfileId = useSelector(selectCurrentProfileId);
  const settings = useSettings();
  const showTvHint = useTvHint();
  const focus = useSelector(selectFocus);
  const rows = useSelector(selectRows);
  const trailerMuted = useSelector(selectTrailerMuted);
  const trailerPaused = useSelector(selectTrailerPaused);
  const heroFocused = useSelector(selectHeroFocused);
  const heroButtonIndex = useSelector(selectHeroButtonIndex);
  const tileTrailerPlaying = useSelector(selectTileTrailerPlaying);
  const navFocused = useSelector(selectNavFocused);
  const firstTile = rows[0]?.tiles[0];

  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const delayTimerRef = useRef<number | null>(null);
  const tileIdRef = useRef<string | null>(null);

  // Should the hero trailer be active?
  // TV: when hero is focused. Web: autoplay after delay.
  // Disabled entirely if user opted out of autoplay in settings.
  const autoplayAllowed = !settings.disableAutoplay;
  const shouldPlayTrailer = autoplayAllowed && (isTv
    ? (heroFocused && !tileTrailerPlaying && !trailerPaused)
    : !trailerPaused);

  // Fetch trailer key when hero becomes focused (with delay)
  useEffect(() => {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }

    if (!shouldPlayTrailer) {
      // Stop playing — fade back to static
      setShowVideo(false);
      setVideoPlaying(false);
      dispatch(setActiveTrailer(null));
      return;
    }

    if (!firstTile?.tmdbId || !firstTile?.mediaType) return;

    const currentTileId = firstTile.id;
    tileIdRef.current = currentTileId;

    delayTimerRef.current = window.setTimeout(async () => {
      const key = await fetchTrailerKey(firstTile.tmdbId!, firstTile.mediaType!);
      if (tileIdRef.current === currentTileId && key) {
        setTrailerKey(key);
        setShowVideo(true);
      }
    }, theme.animation.trailerDwellMs);

    return () => {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
    };
  }, [shouldPlayTrailer, firstTile?.id, firstTile?.tmdbId, firstTile?.mediaType, dispatch]);

  // Reset trailer key when tile changes
  useEffect(() => {
    setTrailerKey(null);
    setVideoPlaying(false);
    setShowVideo(false);
  }, [firstTile?.id]);

  const handlePlaying = useCallback(() => {
    setVideoPlaying(true);
    dispatch(setActiveTrailer('hero'));
  }, [dispatch]);

  const handleError = useCallback(() => {
    setShowVideo(false);
    setVideoPlaying(false);
  }, []);

  // Hide player when video ends so YouTube replay UI never shows
  const handleEnded = useCallback(() => {
    setShowVideo(false);
    setVideoPlaying(false);
    dispatch(setActiveTrailer(null));
  }, [dispatch]);

  // Parallax: animate scrollRatio via ScrollEngine (TV mode only)
  const targetScrollRatio = isTv
    ? ((heroFocused || navFocused || focus.rowIndex <= 0) ? 0 : Math.min((focus.rowIndex - 0.5) / 4, 1))
    : 0;
  const parallax = useScrollAnimation('hero-parallax', 0);
  const prevParallaxTarget = useRef(targetScrollRatio);

  useEffect(() => {
    if (prevParallaxTarget.current !== targetScrollRatio) {
      prevParallaxTarget.current = targetScrollRatio;
      parallax.animate(targetScrollRatio, 450, easeOutQuint);
    }
  }, [targetScrollRatio, parallax]);

  const scrollRatio = parallax.value;
  const fullHeight = 56; // vh units
  const minHeight = 22; // vh units
  const bannerHeightVh = fullHeight - scrollRatio * (fullHeight - minHeight);
  const bannerOpacity = 1 - scrollRatio * 0.6;

  // Hide video when banner is shrinking
  const videoVisible = showVideo && trailerKey && scrollRatio < 0.2;

  const trailerIsLive = !!(videoPlaying && videoVisible);

  if (!firstTile) return null;

  return (
    <div style={heroStyles.container(bannerHeightVh, bannerOpacity)}>
      <img
        src={firstTile.backdropPath ? getTmdbBackdropUrl(firstTile.backdropPath, 'w1280') : getHeroImageUrl()}
        alt="Featured content"
        style={heroStyles.backdrop(videoPlaying && videoVisible ? 0 : 1)}
      />

      {videoVisible && (
        <YouTubePlayer
          videoKey={trailerKey!}
          muted={trailerMuted}
          autoplay={true}
          onPlaying={handlePlaying}
          onEnded={handleEnded}
          onError={handleError}
          style={heroStyles.videoLayer(videoPlaying)}
        />
      )}

      <div style={heroStyles.gradientLeft} />
      <div style={heroStyles.gradientBottom} />

      <div style={heroStyles.textContainer(trailerIsLive)}>
        {firstTile.logoPath ? (
          <img
            src={getTmdbLogoUrl(firstTile.logoPath)}
            alt={firstTile.title}
            style={heroStyles.logoImage}
          />
        ) : (
          <div style={heroStyles.title}>{firstTile.title}</div>
        )}
        <div style={heroStyles.synopsis}>{firstTile.synopsis}</div>

        <div style={heroStyles.buttonsRow(isTv ? heroFocused : true)}>
          {HERO_BUTTONS.map((label, i) => (
            <button
              key={label}
              style={heroStyles.heroButton(isTv ? (heroFocused && i === heroButtonIndex) : false, !isTv)}
              tabIndex={isTv ? -1 : 0}
              onClick={() => {
                if (isTv) {
                  showTvHint();
                  return;
                }
                if (firstTile) {
                  if (i === 0) {
                    dispatch(openDetail(firstTile));
                    dispatch(setTrailerPaused(true));
                  } else if (currentProfileId) {
                    dispatch(toggleWatchlist({ profileId: currentProfileId, tile: firstTile }));
                  }
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* P-to-pause is wired via TV input navigation only — don't advertise
          it on web where the hotkey isn't actually bound. */}
      {isTv && (
        <div style={heroStyles.pauseHint(!!videoVisible && videoPlaying)}>
          <span style={heroStyles.pauseKbd}>P</span>
          <span>to pause</span>
        </div>
      )}
    </div>
  );
});
