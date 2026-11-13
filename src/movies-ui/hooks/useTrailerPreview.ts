import { useState, useEffect, useRef } from 'react';
import { fetchTrailerKey } from '../data/tmdb';
import { theme } from '../styles/theme';
import type { TileData } from '../state/slices/contentSlice';

interface TrailerPreviewState {
  /** Whether the trailer should be shown (dwell timer elapsed + key fetched) */
  showTrailer: boolean;
  /** YouTube video key, null if not yet fetched or unavailable */
  trailerKey: string | null;
  /** Whether the trailer key is currently being fetched */
  isBuffering: boolean;
}

/**
 * Manages the dwell-to-play trailer behavior for a content tile.
 * Starts a timer when the tile gains focus; after the dwell period,
 * fetches the trailer key and signals readiness to play.
 */
export function useTrailerPreview(
  tile: TileData,
  isFocused: boolean,
  paused = false,
): TrailerPreviewState {
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  const timerRef = useRef<number | null>(null);
  const abortedRef = useRef(false);

  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isFocused || paused) {
      // Tile lost focus or paused — hide trailer
      setShowTrailer(false);
      setIsBuffering(false);
      abortedRef.current = true;
      return;
    }

    // Skip tiles without TMDB data
    if (!tile.tmdbId || !tile.mediaType) return;

    abortedRef.current = false;

    timerRef.current = window.setTimeout(async () => {
      if (abortedRef.current) return;

      setIsBuffering(true);
      const key = await fetchTrailerKey(tile.tmdbId!, tile.mediaType!);

      if (abortedRef.current) return;

      setIsBuffering(false);
      if (key) {
        setTrailerKey(key);
        setShowTrailer(true);
      }
    }, theme.animation.trailerDwellMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortedRef.current = true;
    };
  }, [isFocused, paused, tile.tmdbId, tile.mediaType]);

  return { showTrailer, trailerKey, isBuffering };
}
