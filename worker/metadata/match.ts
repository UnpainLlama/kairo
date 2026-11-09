// Duplicate detection. The same title arrives from several providers under different names and IDs.
// Rules, in order: a shared external ID is a certain match; a conflicting ID for the same provider is a certain non-match;
// otherwise score on exact normalised title overlap plus year, format and episode count. There is no fuzzy matching on purpose:
// a wrong merge puts one show's data on another, which is worse than a missed merge.
import { titleKey } from './normalize';
import type { ExternalIds, Format } from './types';

export type MatchSubject = { ids: ExternalIds; titles: string[]; year: number | null; format: Format | null; episodeCount: number | null };

export const ACCEPT_THRESHOLD = 0.85;
export const AMBIGUOUS_THRESHOLD = 0.6;

export function scoreMatch(a: MatchSubject, b: MatchSubject): number {
  let shared = false;
  for (const [provider, id] of Object.entries(a.ids)) {
    const other = b.ids[provider];
    if (other === undefined) continue;
    if (other === id) shared = true;
    else return 0; // same provider, different ID: two distinct entries
  }
  if (shared) return 1;

  const keysA = new Set(a.titles.map(titleKey).filter(Boolean));
  const overlap = b.titles.map(titleKey).some((k) => k !== '' && keysA.has(k));
  if (!overlap) return 0;

  let score = 0.7;
  if (a.year !== null && b.year !== null) {
    const diff = Math.abs(a.year - b.year);
    if (diff === 0) score += 0.15;
    else if (diff === 1) score -= 0.2;
    else return 0;
  }
  if (a.format !== null && b.format !== null) score += a.format === b.format ? 0.1 : -0.3;
  if (a.episodeCount !== null && b.episodeCount !== null) score += a.episodeCount === b.episodeCount ? 0.05 : -0.1;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

export type MatchClass = 'match' | 'ambiguous' | 'different';
export const classify = (score: number): MatchClass => (score >= ACCEPT_THRESHOLD ? 'match' : score >= AMBIGUOUS_THRESHOLD ? 'ambiguous' : 'different');

/** Best candidate that clears ACCEPT_THRESHOLD, and only if it is not tied with another candidate. */
export function pickBest<T>(subject: MatchSubject, candidates: T[], toSubject: (c: T) => MatchSubject): { candidate: T; score: number } | null {
  const scored = candidates.map((candidate) => ({ candidate, score: scoreMatch(subject, toSubject(candidate)) })).sort((x, y) => y.score - x.score);
  const [best, second] = scored;
  if (!best || classify(best.score) !== 'match') return null;
  if (second && second.score === best.score && best.score < 1) return null; // tie: refuse to guess
  return best;
}
