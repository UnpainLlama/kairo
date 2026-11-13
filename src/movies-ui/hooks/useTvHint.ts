import { useCallback, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { showTvHint, hideTvHint } from '../state/slices/uiSlice';

const HINT_DURATION_MS = 2500;

/**
 * Returns a function that shows the "TV mode — use the keyboard" toast.
 * Auto-dismisses after HINT_DURATION_MS. Clears any in-flight timeout so
 * rapid clicks just keep the toast visible without stacking.
 */
export function useTvHint() {
  const dispatch = useDispatch();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return useCallback(() => {
    dispatch(showTvHint());
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      dispatch(hideTvHint());
      timerRef.current = null;
    }, HINT_DURATION_MS);
  }, [dispatch]);
}
