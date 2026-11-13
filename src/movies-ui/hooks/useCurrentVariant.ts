import { getVariantById, type VariantDef } from '../data/variants';
import { useCurrentProfile } from './useProfile';

/**
 * Returns the current profile's selected UI variant definition, or null if
 * none is set yet (in which case the variant picker should be shown).
 */
export function useCurrentVariant(): VariantDef | null {
  const profile = useCurrentProfile();
  return getVariantById(profile?.variant);
}
