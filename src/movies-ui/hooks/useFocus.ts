import { useSelector } from 'react-redux';
import { selectFocus } from '../state/selectors';

export function useFocus(rowIndex: number, tileIndex: number) {
  const focus = useSelector(selectFocus);
  const isFocused = focus.rowIndex === rowIndex && focus.tileIndex === tileIndex;
  const isRowFocused = focus.rowIndex === rowIndex;
  return { isFocused, isRowFocused };
}
