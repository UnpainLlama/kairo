import { useSelector } from 'react-redux';
import {
  selectCurrentProfile,
  selectProfilesForCurrentUser,
} from '../state/selectors';

export function useCurrentProfile() {
  return useSelector(selectCurrentProfile);
}

export function useProfiles() {
  return useSelector(selectProfilesForCurrentUser);
}
