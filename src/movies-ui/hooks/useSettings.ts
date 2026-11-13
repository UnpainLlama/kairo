import { useSelector } from 'react-redux';
import { selectCurrentSettings } from '../state/selectors';

export function useSettings() {
  return useSelector(selectCurrentSettings);
}
