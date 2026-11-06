import type { ThemeName } from '../types';

export const THEMES: { id: ThemeName; label: string; swatches: string[] }[] = [
  { id: 'astral-plum', label: 'Astral Plum', swatches: ['#090B16', '#9278FF', '#62D8C8'] },
  { id: 'sakura-ember', label: 'Sakura Ember', swatches: ['#100B14', '#F0789A', '#FFB36F'] },
  { id: 'ocean-circuit', label: 'Ocean Circuit', swatches: ['#06131B', '#36B8CB', '#8C8BFF'] },
  { id: 'moonlit-jade', label: 'Moonlit Jade', swatches: ['#07130F', '#60CDA5', '#A9A0FF'] },
];

const KEY = 'kairo-theme';
const isTheme = (v: unknown): v is ThemeName => THEMES.some((t) => t.id === v);

/** The theme choice is the only thing KAIRO keeps in browser storage. */
export function readStoredTheme(): ThemeName {
  try {
    const value = localStorage.getItem(KEY);
    return isTheme(value) ? value : 'astral-plum';
  } catch {
    return 'astral-plum';
  }
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the theme still applies for this visit */
  }
}
