import type { ComponentType } from 'react';
import { ClassicPreview } from '../components/variant/svg/ClassicPreview';
import { ModernAuroraPreview } from '../components/variant/svg/ModernAuroraPreview';
import { ModernGridPreview } from '../components/variant/svg/ModernGridPreview';

/**
 * Identifier for a UI variant. Add new ids here when introducing new variants.
 */
export type VariantId = 'classic' | 'modern-aurora' | 'modern-grid';

export interface VariantDef {
  id: VariantId;
  name: string;
  tagline: string;
  /** Color used as the SVG preview accent and focus glow tint. */
  accentColor: string;
  /** 'available' = pickable + lands in the variant's Shell. 'coming-soon' = locked card. */
  status: 'available' | 'coming-soon';
  /** Inline-SVG mini-mockup rendered inside the card. */
  Preview: ComponentType<{ accent: string }>;
}

export const VARIANTS: VariantDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'The familiar grid you know.',
    accentColor: '#E50914',
    status: 'available',
    Preview: ClassicPreview,
  },
  {
    id: 'modern-aurora',
    name: 'Aurora',
    tagline: 'Cinematic, ambient, fluid.',
    accentColor: '#7B5CFF',
    status: 'coming-soon',
    Preview: ModernAuroraPreview,
  },
  {
    id: 'modern-grid',
    name: 'Lattice',
    tagline: 'Spatial, dense, exploratory.',
    accentColor: '#36D1A1',
    status: 'coming-soon',
    Preview: ModernGridPreview,
  },
];

export function getVariantById(id: VariantId | null | undefined): VariantDef | null {
  if (!id) return null;
  return VARIANTS.find((v) => v.id === id) ?? null;
}
