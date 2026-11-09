// Conflict resolution. Static, documented priority per field (docs/PROVIDERS.md), with provenance kept for every value.
import { uniqueStrings } from './normalize';
import type { ExternalIds, Format, NormalizedMetadata, Season, Status } from './types';

export type ScalarField = 'title' | 'synopsis' | 'format' | 'status' | 'season' | 'year' | 'episodeCount' | 'posterUrl' | 'bannerUrl' | 'rating';
export type SetField = 'genres' | 'synonyms' | 'ids';
export type Field = ScalarField | SetField;

/** Earlier = preferred. Providers not listed rank after listed ones, in alphabetical order. */
export type PriorityTable = Record<ScalarField, string[]>;

export const DEFAULT_PRIORITY: PriorityTable = {
  title: ['anilist', 'kitsu', 'manami'],
  synopsis: ['anilist', 'kitsu', 'manami'],
  format: ['anilist', 'kitsu', 'manami'],
  status: ['anilist', 'kitsu', 'manami'], // live providers beat the stored snapshot
  season: ['anilist', 'kitsu', 'manami'],
  year: ['anilist', 'kitsu', 'manami'],
  episodeCount: ['anilist', 'kitsu', 'manami'],
  posterUrl: ['anilist', 'kitsu', 'manami'],
  bannerUrl: ['anilist', 'kitsu', 'manami'],
  rating: ['anilist', 'kitsu', 'manami'],
};

/** Presentation fields differ by nature (wording, image size), so a difference is not recorded as a data conflict. */
const NO_CONFLICT: ReadonlySet<ScalarField> = new Set(['title', 'synopsis', 'posterUrl', 'bannerUrl']);

export type Provenance = { provider: string; fetchedAt: string };
export type Conflict = { field: ScalarField; chosen: { provider: string; value: string | number }; alternatives: { provider: string; value: string | number }[] };

export type Unified = {
  title: string | null;
  synopsis: string | null;
  format: Format | null;
  status: Status | null;
  season: Season | null;
  year: number | null;
  episodeCount: number | null;
  posterUrl: string | null;
  bannerUrl: string | null;
  rating: number | null;
  genres: string[];
  synonyms: string[];
  ids: ExternalIds;
  provenance: Partial<Record<Field, Provenance[]>>;
  conflicts: Conflict[];
  contributors: string[];
};

const SCALARS: ScalarField[] = ['title', 'synopsis', 'format', 'status', 'season', 'year', 'episodeCount', 'posterUrl', 'bannerUrl', 'rating'];

function rank(table: PriorityTable, field: ScalarField, provider: string): number {
  const i = table[field].indexOf(provider);
  return i === -1 ? table[field].length : i;
}

export function mergeMetadata(inputs: NormalizedMetadata[], table: PriorityTable = DEFAULT_PRIORITY): Unified {
  const out: Unified = {
    title: null, synopsis: null, format: null, status: null, season: null, year: null, episodeCount: null,
    posterUrl: null, bannerUrl: null, rating: null, genres: [], synonyms: [], ids: {}, provenance: {}, conflicts: [], contributors: [],
  };
  const results = { out: out as Record<string, unknown> };

  for (const field of SCALARS) {
    const candidates = inputs
      .map((m) => ({ m, value: m[field] as string | number | null }))
      .filter((c): c is { m: NormalizedMetadata; value: string | number } => c.value !== null && c.value !== '')
      .sort((a, b) => rank(table, field, a.m.provider) - rank(table, field, b.m.provider) || a.m.provider.localeCompare(b.m.provider));
    const best = candidates[0];
    if (!best) continue;
    results.out[field] = best.value;
    out.provenance[field] = [{ provider: best.m.provider, fetchedAt: best.m.fetchedAt }];
    if (!NO_CONFLICT.has(field)) {
      const differing = candidates.filter((c) => String(c.value).toLowerCase() !== String(best.value).toLowerCase());
      if (differing.length > 0) {
        out.conflicts.push({
          field,
          chosen: { provider: best.m.provider, value: best.value },
          alternatives: differing.map((c) => ({ provider: c.m.provider, value: c.value })),
        });
      }
    }
  }

  // Set-like fields are unions; provenance lists every contributing provider.
  const ordered = [...inputs].sort((a, b) => rank(table, 'title', a.provider) - rank(table, 'title', b.provider) || a.provider.localeCompare(b.provider));
  out.genres = uniqueStrings(ordered.flatMap((m) => m.genres));
  out.synonyms = uniqueStrings(ordered.flatMap((m) => [m.titleEnglish, m.titleRomaji, m.titleNative, m.title, ...m.synonyms]).filter((t) => t !== out.title));
  for (const m of ordered) for (const [p, id] of Object.entries(m.ids)) if (!(p in out.ids)) out.ids[p] = id;
  const contributors = (pick: (m: NormalizedMetadata) => boolean): Provenance[] => ordered.filter(pick).map((m) => ({ provider: m.provider, fetchedAt: m.fetchedAt }));
  const g = contributors((m) => m.genres.length > 0);
  if (g.length) out.provenance.genres = g;
  const s = contributors((m) => m.synonyms.length > 0 || m.titleEnglish !== null || m.titleRomaji !== null || m.titleNative !== null);
  if (s.length) out.provenance.synonyms = s;
  const i = contributors((m) => Object.keys(m.ids).length > 0);
  if (i.length) out.provenance.ids = i;
  out.contributors = [...new Set(ordered.map((m) => m.provider))];
  return out;
}
