import { useState, useCallback, useEffect, useRef } from 'react';
import { scrollEngine } from '../engine/ScrollEngine';

interface UseScrollAnimationResult {
  /** Current animated value */
  value: number;
  /** Start or update an animation */
  animate: (to: number, duration: number, easing: (t: number) => number, onComplete?: () => void) => void;
  /** Stop the animation at its current value */
  stop: () => void;
  /** Whether the animation is currently running */
  isAnimating: boolean;
}

/**
 * React hook that bridges the ScrollEngine to component state.
 * Each instance gets a unique animation key.
 *
 * @param key — unique animation identifier
 * @param initialValue — starting value before any animation
 */
export function useScrollAnimation(key: string, initialValue = 0): UseScrollAnimationResult {
  const [value, setValue] = useState(initialValue);
  const [animating, setAnimating] = useState(false);
  const currentValueRef = useRef(initialValue);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      scrollEngine.stop(key);
    };
  }, [key]);

  const animate = useCallback(
    (to: number, duration: number, easing: (t: number) => number, onComplete?: () => void) => {
      setAnimating(true);
      scrollEngine.animate(key, {
        from: currentValueRef.current,
        to,
        duration,
        easing,
        onUpdate: (v) => {
          currentValueRef.current = v;
          setValue(v);
        },
        onComplete: () => {
          setAnimating(false);
          onComplete?.();
        },
      });
    },
    [key]
  );

  const stop = useCallback(() => {
    scrollEngine.stop(key);
    setAnimating(false);
  }, [key]);

  return { value, animate, stop, isAnimating: animating };
}
