// URL <-> search state. The API requires q (2–100 chars) and validates every other value, so the client mirrors those rules.
export const SEARCH_FORMATS = ['series', 'movie', 'ova', 'ona', 'special'] as const;
export const SEARCH_SORTS = ['relevance', 'popularity', 'latest', 'rating'] as const;
export const MIN_QUERY = 2;
export const MAX_QUERY = 100;

export type SearchState = {
  q: string;
  genre: string;
  format: '' | (typeof SEARCH_FORMATS)[number];
  sort: (typeof SEARCH_SORTS)[number];
  page: number;
};

export const DEFAULT_SORT: SearchState['sort'] = 'relevance';

export function parseSearchState(params: URLSearchParams): SearchState {
  const format = (params.get('format') ?? '').toLowerCase();
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page') ?? '1');
  return {
    q: (params.get('q') ?? '').slice(0, MAX_QUERY),
    genre: (params.get('genre') ?? '').slice(0, 40),
    format: (SEARCH_FORMATS as readonly string[]).includes(format) ? (format as SearchState['format']) : '',
    sort: (SEARCH_SORTS as readonly string[]).includes(sort) ? (sort as SearchState['sort']) : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

/** Browser URL: only non-default values. */
export function toUrlParams(state: SearchState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.genre) p.set('genre', state.genre);
  if (state.format) p.set('format', state.format);
  if (state.sort !== DEFAULT_SORT) p.set('sort', state.sort);
  if (state.page > 1) p.set('page', String(state.page));
  return p;
}

export const canSearch = (q: string): boolean => q.trim().length >= MIN_QUERY;

/** API path, or null when the query is too short for the API to accept. */
export function toApiPath(state: SearchState, limit = 24): string | null {
  const q = state.q.trim();
  if (!canSearch(q)) return null;
  const p = new URLSearchParams({ q, page: String(state.page), limit: String(limit), sort: state.sort });
  if (state.genre) p.set('genre', state.genre);
  if (state.format) p.set('format', state.format);
  return `/catalog/search?${p.toString()}`;
}
