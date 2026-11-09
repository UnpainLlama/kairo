// URL <-> search state. /catalog/search needs q (2–100 chars); without a usable q the page uses /catalog/browse, which takes the same filters.
// Both endpoints validate every value, so the client mirrors those rules.
export const SEARCH_FORMATS = ['series', 'movie', 'ova', 'ona', 'special'] as const;
export const SEARCH_STATUSES = ['airing', 'finished', 'upcoming', 'hiatus'] as const;
export const SEARCH_SORTS = ['relevance', 'popularity', 'latest', 'rating'] as const;
export const MIN_QUERY = 2;
export const MAX_QUERY = 100;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

export type SortKey = (typeof SEARCH_SORTS)[number];

export type SearchState = {
  q: string;
  genre: string;
  format: '' | (typeof SEARCH_FORMATS)[number];
  status: '' | (typeof SEARCH_STATUSES)[number];
  year: number | null;
  /** '' means "default": relevance when there is a title query, popularity otherwise. */
  sort: '' | SortKey;
  page: number;
};

export const EMPTY_SEARCH: SearchState = { q: '', genre: '', format: '', status: '', year: null, sort: '', page: 1 };

export function parseSearchState(params: URLSearchParams): SearchState {
  const format = (params.get('format') ?? '').toLowerCase();
  const status = (params.get('status') ?? '').toLowerCase();
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page') ?? '1');
  const year = Number(params.get('year') ?? '');
  return {
    q: (params.get('q') ?? '').slice(0, MAX_QUERY),
    genre: (params.get('genre') ?? '').slice(0, 40),
    format: (SEARCH_FORMATS as readonly string[]).includes(format) ? (format as SearchState['format']) : '',
    status: (SEARCH_STATUSES as readonly string[]).includes(status) ? (status as SearchState['status']) : '',
    year: Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : null,
    sort: (SEARCH_SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : '',
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

/** Browser URL: only non-default values. */
export function toUrlParams(state: SearchState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.genre) p.set('genre', state.genre);
  if (state.format) p.set('format', state.format);
  if (state.status) p.set('status', state.status);
  if (state.year !== null) p.set('year', String(state.year));
  if (state.sort) p.set('sort', state.sort);
  if (state.page > 1) p.set('page', String(state.page));
  return p;
}

export const canSearch = (q: string): boolean => q.trim().length >= MIN_QUERY;

/** True when any filter (not the title text) is set. */
export const hasFilters = (state: SearchState): boolean =>
  Boolean(state.genre || state.format || state.status || state.year !== null || state.sort);

/**
 * API path for the current state. A title query of 2+ characters uses /catalog/search; otherwise the same
 * filters go to /catalog/browse, which does not need title text.
 */
export function toApiPath(state: SearchState, limit = 24): string {
  const q = state.q.trim();
  const searching = canSearch(q);
  const sort = state.sort || (searching ? 'relevance' : 'popularity');
  const p = new URLSearchParams();
  if (searching) p.set('q', q);
  p.set('page', String(state.page));
  p.set('limit', String(limit));
  p.set('sort', sort);
  if (state.genre) p.set('genre', state.genre);
  if (state.format) p.set('format', state.format);
  if (state.status) p.set('status', state.status);
  if (state.year !== null) p.set('year', String(state.year));
  return `${searching ? '/catalog/search' : '/catalog/browse'}?${p.toString()}`;
}
