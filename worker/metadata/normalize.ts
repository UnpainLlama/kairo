import type { Format, Season, Status } from './types';

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim().toUpperCase().replace(/[\s-]+/g, '_') : '');

const FORMATS: Record<string, Format | null> = {
  TV: 'series', TV_SHORT: 'series', SERIES: 'series', MOVIE: 'movie', FILM: 'movie',
  OVA: 'ova', ONA: 'ona', SPECIAL: 'special', TV_SPECIAL: 'special',
  MUSIC: null, UNKNOWN: null, CM: null, PV: null,
};
export const normalizeFormat = (raw: unknown): Format | null => FORMATS[clean(raw)] ?? null;

const STATUSES: Record<string, Status | null> = {
  // AniList
  // KAIRO's own stored values must round-trip
  AIRING: 'airing',
  FINISHED: 'finished', RELEASING: 'airing', NOT_YET_RELEASED: 'upcoming', HIATUS: 'hiatus', CANCELLED: null,
  // Kitsu
  CURRENT: 'airing', TBA: 'upcoming', UNRELEASED: 'upcoming', UPCOMING: 'upcoming',
  // anime-offline-database
  ONGOING: 'airing', UNKNOWN: null,
};
export const normalizeStatus = (raw: unknown): Status | null => STATUSES[clean(raw)] ?? null;

const SEASONS: Record<string, Season> = { WINTER: 'winter', SPRING: 'spring', SUMMER: 'summer', FALL: 'fall', AUTUMN: 'fall' };
export const normalizeSeason = (raw: unknown): Season | null => SEASONS[clean(raw)] ?? null;

export const positiveInt = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
};

export const yearOrNull = (v: unknown): number | null => {
  const n = positiveInt(v);
  return n !== null && n >= 1900 && n <= 2100 ? n : null;
};

/** Convert a 0-100 score to KAIRO's 0-10 scale, one decimal. Anything outside 0-100 is rejected, not clamped. */
export function ratingFrom100(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n) / 10;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

/** Provider synopses can contain HTML. KAIRO stores and renders plain text only. */
export function plainText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text === '' ? null : text;
}

export const httpsUrlOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
};

export function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    const key = t.toLowerCase();
    if (t === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Comparison key for titles: Unicode-normalised, lower-cased, punctuation removed, spaces collapsed. */
export function titleKey(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
