// Pure request validation. No runtime imports, so it is unit-testable without Workers bindings.
export type Result<T> = { ok: true; value: T } | { ok: false; message: string };
type Query = Record<string, string | undefined>;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (message: string): Result<never> => ({ ok: false, message });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Strict digits-only integer parser. Rejects "1e1", "0x10", " 5", "-1" and out-of-range values. */
export function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number | null {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

export function parseId(raw: string | undefined): string | null {
  return raw !== undefined && /^[A-Za-z0-9._:-]{1,128}$/.test(raw) ? raw : null;
}

export type Pagination = { page: number; limit: number; offset: number };

export function parsePagination(q: Query, opts: { defaultLimit?: number; maxLimit?: number } = {}): Result<Pagination> {
  const maxLimit = opts.maxLimit ?? 50;
  const page = boundedInt(q.page, 1, 1, 500);
  const limit = boundedInt(q.limit, opts.defaultLimit ?? 24, 1, maxLimit);
  if (page === null || limit === null) return err(`page must be 1–500 and limit must be 1–${maxLimit}.`);
  return ok({ page, limit, offset: (page - 1) * limit });
}

export const SORT_KEYS = ['relevance', 'popularity', 'latest', 'rating'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Static fragments only. The client never supplies SQL; it picks a key from SORT_KEYS. */
export const SORT_ORDER_BY: Record<SortKey, string> = {
  relevance: 'popularity_score DESC, title COLLATE NOCASE',
  popularity: 'popularity_score DESC, title COLLATE NOCASE',
  latest: 'updated_at DESC, title COLLATE NOCASE',
  rating: 'rating IS NULL, rating DESC, title COLLATE NOCASE',
};

// Ingestion must normalise stored values to these lowercase forms for the filters to match.
export const FORMATS = ['series', 'movie', 'ova', 'ona', 'special'] as const;
export const STATUSES = ['airing', 'finished', 'upcoming', 'hiatus'] as const;
export const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;

export type SearchParams = Pagination & {
  q: string;
  sort: SortKey;
  genre?: string;
  year?: number;
  format?: (typeof FORMATS)[number];
  status?: (typeof STATUSES)[number];
  season?: (typeof SEASONS)[number];
};

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[]): T | undefined | null {
  if (raw === undefined || raw === '') return undefined;
  const value = raw.toLowerCase() as T;
  return allowed.includes(value) ? value : null; // null = present but invalid
}

export function parseSearchParams(q: Query): Result<SearchParams> {
  const text = (q.q ?? '').trim();
  if (text.length < 2 || text.length > 100) return err('q must be 2–100 characters.');
  const paging = parsePagination(q);
  if (!paging.ok) return paging;

  const sort = q.sort === undefined || q.sort === '' ? 'relevance' : (SORT_KEYS as readonly string[]).includes(q.sort) ? (q.sort as SortKey) : null;
  if (sort === null) return err(`sort must be one of: ${SORT_KEYS.join(', ')}.`);

  const format = oneOf(q.format, FORMATS);
  const status = oneOf(q.status, STATUSES);
  const season = oneOf(q.season, SEASONS);
  if (format === null || status === null || season === null) return err('Invalid format, status, or season filter.');

  let year: number | undefined;
  if (q.year !== undefined && q.year !== '') {
    const y = boundedInt(q.year, 0, 1900, 2100);
    if (y === null) return err('year must be between 1900 and 2100.');
    year = y;
  }

  let genre: string | undefined;
  if (q.genre !== undefined && q.genre !== '') {
    const g = q.genre.trim();
    if (g.length > 40 || !/^[\p{L}\p{N} &'-]+$/u.test(g)) return err('Invalid genre filter.');
    genre = g;
  }

  return ok({ ...paging.value, q: text, sort, genre, year, format, status, season });
}

export const LIBRARY_STATUSES = ['watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped'] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];
export type LibraryInput = { status: LibraryStatus; isFavorite?: boolean };

export function parseLibraryBody(body: unknown): Result<LibraryInput> {
  if (!isRecord(body)) return err('Request body must be a JSON object.');
  if (Object.keys(body).some((k) => k !== 'status' && k !== 'isFavorite')) return err('Unknown fields are not allowed.');
  if (typeof body.status !== 'string' || !(LIBRARY_STATUSES as readonly string[]).includes(body.status)) {
    return err(`status must be one of: ${LIBRARY_STATUSES.join(', ')}.`);
  }
  if (body.isFavorite !== undefined && typeof body.isFavorite !== 'boolean') return err('isFavorite must be a boolean.');
  return ok({ status: body.status as LibraryStatus, isFavorite: body.isFavorite });
}

export type ProgressInput = { positionSeconds: number; durationSeconds: number | null; completed: boolean };
const MAX_SECONDS = 86_400;

/** Identity comes from the authenticated session, so any client-sent userId is rejected as an unknown field. */
export function parseProgressBody(body: unknown): Result<ProgressInput> {
  if (!isRecord(body)) return err('Request body must be a JSON object.');
  if (Object.keys(body).some((k) => !['positionSeconds', 'durationSeconds', 'completed'].includes(k))) return err('Unknown fields are not allowed.');

  const pos = body.positionSeconds;
  if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0 || pos > MAX_SECONDS) return err('positionSeconds must be a finite number from 0 to 86400.');

  let duration: number | null = null;
  if (body.durationSeconds !== undefined && body.durationSeconds !== null) {
    const d = body.durationSeconds;
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 1 || d > MAX_SECONDS) return err('durationSeconds must be a finite number from 1 to 86400.');
    if (pos > d + 5) return err('positionSeconds cannot exceed durationSeconds.');
    duration = d;
  }

  if (body.completed !== undefined && typeof body.completed !== 'boolean') return err('completed must be a boolean.');
  return ok({ positionSeconds: pos, durationSeconds: duration, completed: body.completed ?? false });
}
