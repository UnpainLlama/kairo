export const ANIME_SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;
export type AnimeSeason = (typeof ANIME_SEASONS)[number];

/** Returns the current AniList-style season using UTC month boundaries. */
export function currentAnimeSeason(date: Date = new Date()): { season: AnimeSeason; year: number } {
  const month = date.getUTCMonth();
  const season: AnimeSeason = month < 3 ? 'winter' : month < 6 ? 'spring' : month < 9 ? 'summer' : 'fall';
  return { season, year: date.getUTCFullYear() };
}
