export const YOUTUBE_RECENT_SEARCHES_KEY = 'kairo-youtube-recent-searches';

const CURATED_COMPLETIONS = [
  'minecraft mods',
  'minecraft with disabilities',
  'minecraft 100 days',
  'minecraft movie',
  'minecraft civilization',
  'minecraft house',
  'minecraft horror',
  'minecraft house tutorial',
  'minecraft songs',
  'minecraft music',
  'minecraft survival',
  'minecraft redstone',
  'minecraft shaders',
  'minecraft build ideas',
  'gaming highlights',
  'gaming walkthrough',
  'music mix',
  'lofi music',
  'cooking recipes',
  'easy dinner recipes',
  'technology news',
  'science explained',
  'anime clips',
  'anime openings',
  'podcasts',
  'documentaries',
];

const GENERIC_COMPLETION_SUFFIXES = [
  'tutorial',
  'gameplay',
  'explained',
  'review',
  'highlights',
  'compilation',
];

export function buildYouTubeSearchSuggestions(query: string, recent: string[] = [], limit = 8): string[] {
  const clean = query.trim().replace(/\s+/g, ' ');
  if (clean.length < 2) return [];

  const normalized = clean.toLocaleLowerCase();
  const candidates = [
    ...recent.filter(value => value.toLocaleLowerCase().startsWith(normalized)),
    ...CURATED_COMPLETIONS.filter(value => value.startsWith(normalized)),
    ...GENERIC_COMPLETION_SUFFIXES.map(suffix => clean + ' ' + suffix),
  ];

  const seen = new Set<string>([normalized]);
  const suggestions: string[] = [];
  for (const candidate of candidates) {
    const value = candidate.trim().replace(/\s+/g, ' ');
    const key = value.toLocaleLowerCase();
    if (value.length < 2 || value.length > 80 || seen.has(key)) continue;
    seen.add(key);
    suggestions.push(value);
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

export function normalizeRecentYouTubeSearches(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const searches: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().replace(/\s+/g, ' ').slice(0, 80);
    const key = clean.toLocaleLowerCase();
    if (clean.length < 2 || seen.has(key)) continue;
    seen.add(key);
    searches.push(clean);
    if (searches.length === 8) break;
  }
  return searches;
}
