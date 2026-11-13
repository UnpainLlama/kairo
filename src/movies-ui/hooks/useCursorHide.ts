import { useEffect, useRef } from 'react';
import { useIsTvMode } from './useMode';

const IDLE_TIMEOUT = 3000; // ms before cursor hides again after mouse move

/**
 * In TV mode: hides cursor on keyboard/gamepad input,
 * shows it when mouse moves, hides again after 3s idle.
 */
export function useCursorHide() {
  const isTv = useIsTvMode();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isTv) {
      // Ensure cursor is visible when not in TV mode
      document.body.style.cursor = '';
      return;
    }

    const hideCursor = () => {
      document.body.style.cursor = 'none';
    };

    const showCursor = () => {
      document.body.style.cursor = '';
      // Start idle timer
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(hideCursor, IDLE_TIMEOUT);
    };

    // Hide on keyboard input
    const onKeyDown = () => hideCursor();

    // Show on mouse move
    const onMouseMove = () => showCursor();

    // Start hidden
    hideCursor();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
      if (timerRef.current) clearTimeout(timerRef.current);
      document.body.style.cursor = '';
    };
  }, [isTv]);
}
