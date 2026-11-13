import { useSelector } from 'react-redux';
import { selectInteractionMode } from '../state/selectors';
import type { InteractionMode } from '../state/slices/uiSlice';

export function useMode(): InteractionMode {
  return useSelector(selectInteractionMode);
}

export function useIsTvMode(): boolean {
  return useSelector(selectInteractionMode) === 'tv';
}

export function useIsWebMode(): boolean {
  return useSelector(selectInteractionMode) === 'web';
}
