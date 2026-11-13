import { useSelector } from 'react-redux';
import {
  selectCurrentUser,
  selectIsAuthenticated,
  selectAccounts,
} from '../state/selectors';

export function useCurrentUser() {
  return useSelector(selectCurrentUser);
}

export function useIsAuthenticated() {
  return useSelector(selectIsAuthenticated);
}

export function useAccounts() {
  return useSelector(selectAccounts);
}
