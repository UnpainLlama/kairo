// Orchestration for the live catalogue: cache first, providers in priority order, failover, and stale-on-error.
// Provider responses are only ever kept in the short-lived cache (see metadata/cache.ts); nothing is written to D1.
import type { CircuitBreaker } from '../metadata/breaker';
import type { MetadataCache } from '../metadata/cache';
import { sharedBreaker, createCache } from '../metadata/service';
import type { FetchLike } from '../metadata/providers/http';
import { ProviderError } from '../metadata/types';
import { createAniListSource } from './anilist';
import { createJikanSource } from './jikan';
import type { Ref } from './ids';
import type { BrowseQuery, CatalogSource, EpisodePage, ListKind, LiveEnv, LiveTitle, Paged, SourceId } from './types';

export type Deps = {
  sources: CatalogSource[];
  cache: MetadataCache;
  breaker: CircuitBreaker;
  now: () => number;
  timeoutMs?: number;
  onError?: (source: SourceId, error: ProviderError) => void;
};

/** Fresh = served without calling a provider. Stale = only used when every provider fails. All values are seconds. */
export const TTL = {
  list: { fresh: 3600, stale: 86_400 },
  latest: { fresh: 1800, stale: 86_400 },
  search: { fresh: 600, stale: 3600 },
  genres: { fresh: 86_400, stale: 604_800 },
  detail: { fresh: 21_600, stale: 86_400 },
  related: { fresh: 21_600, stale: 86_400 },
  episodes: { fresh: 21_600, stale: 86_400 },
} as const;
const FALLBACK_FRESH_SECONDS = 300; // data that came from a fallback provider is re-tried against the primary sooner

type Entry<T> = { value: T; via: SourceId; freshUntil: number; staleUntil: number };
export type Outcome<T> = { value: T; via: SourceId; primary: SourceId; cached: boolean; stale: boolean; degraded: boolean };
type Candidate<T> = { source: CatalogSource; run: (signal: AbortSignal) => Promise<T> };

const inflight = new Map<string, Promise<Outcome<unknown>>>();

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fn(controller.signal); } finally { clearTimeout(timer); }
}

export function resolve<T>(deps: Deps, spec: { key: string; ttl: { fresh: number; stale: number }; candidates: Candidate<T>[] }): Promise<Outcome<T>> {
  const existing = inflight.get(spec.key);
  if (existing) return existing as Promise<Outcome<T>>;
  const p = doResolve(deps, spec).finally(() => inflight.delete(spec.key));
  inflight.set(spec.key, p as Promise<Outcome<unknown>>);
  return p;
}

async function doResolve<T>(deps: Deps, spec: { key: string; ttl: { fresh: number; stale: number }; candidates: Candidate<T>[] }): Promise<Outcome<T>> {
  const first = spec.candidates[0];
  if (!first) throw new ProviderError('not_found', 'No provider can serve this request.');
  const primary = first.source.id;
  const cached = await deps.cache.get<Entry<T>>(spec.key);
  if (cached && cached.freshUntil > deps.now()) {
    return { value: cached.value, via: cached.via, primary, cached: true, stale: false, degraded: cached.via !== primary };
  }

  let lastError: ProviderError | null = null;
  for (const cand of spec.candidates) {
    const id = cand.source.id;
    if (!deps.breaker.canRequest(id, deps.now())) {
      lastError ??= new ProviderError('unavailable', `${cand.source.displayName} is temporarily paused after repeated failures.`);
      continue;
    }
    try {
      const value = await withTimeout(deps.timeoutMs ?? 8000, cand.run);
      deps.breaker.recordSuccess(id);
      const t = deps.now();
      const fresh = id === primary ? spec.ttl.fresh : Math.min(spec.ttl.fresh, FALLBACK_FRESH_SECONDS);
      const entry: Entry<T> = { value, via: id, freshUntil: t + fresh * 1000, staleUntil: t + spec.ttl.stale * 1000 };
      await deps.cache.put(spec.key, entry, spec.ttl.stale);
      return { value, via: id, primary, cached: false, stale: false, degraded: id !== primary };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError('unavailable', 'Unexpected provider failure.');
      // The provider answered, so it is healthy: a missing title is not a reason to try another provider or open the breaker.
      if (err.kind === 'not_found') { deps.breaker.recordSuccess(id); throw err; }
      deps.breaker.recordFailure(id, deps.now(), err.retryAfterSeconds);
      deps.onError?.(id, err);
      lastError = err;
    }
  }
  if (cached && cached.staleUntil > deps.now()) {
    return { value: cached.value, via: cached.via, primary, cached: true, stale: true, degraded: true };
  }
  throw lastError ?? new ProviderError('unavailable', 'No data provider is available.');
}

const candidatesFor = <T>(deps: Deps, ref: Ref, run: (s: CatalogSource, signal: AbortSignal) => Promise<T>): Candidate<T>[] =>
  deps.sources.filter((s) => s.supports(ref)).map((source) => ({ source, run: (signal) => run(source, signal) }));

export function getList(deps: Deps, kind: ListKind, page: number, limit: number): Promise<Outcome<Paged>> {
  return resolve(deps, {
    key: `live:list:${kind}:${page}:${limit}`,
    ttl: kind === 'latest' ? TTL.latest : TTL.list,
    candidates: deps.sources.map((source) => ({ source, run: (signal) => source.list(kind, page, limit, signal) })),
  });
}

export function browse(deps: Deps, q: BrowseQuery): Promise<Outcome<Paged>> {
  const key = ['browse', q.q?.trim().toLowerCase() ?? '', q.sort, q.genre ?? '', q.year ?? '', q.format ?? '', q.status ?? '', q.season ?? '', q.page, q.limit].join('|');
  return resolve(deps, {
    key: `live:${encodeURIComponent(key)}`,
    ttl: q.q ? TTL.search : TTL.list,
    candidates: deps.sources.map((source) => ({ source, run: (signal) => source.browse(q, signal) })),
  });
}

export function getGenres(deps: Deps): Promise<Outcome<{ name: string; count: number }[]>> {
  return resolve(deps, {
    key: 'live:genres',
    ttl: TTL.genres,
    candidates: deps.sources.map((source) => ({ source, run: (signal) => source.genres(signal) })),
  });
}

export function getTitle(deps: Deps, ref: Ref): Promise<Outcome<LiveTitle>> {
  // MyAnimeList ids try Jikan first. AniList ids can only come from AniList.
  const ordered = ref.kind === 'm' ? [...deps.sources].sort((a, b) => Number(b.id === 'jikan') - Number(a.id === 'jikan')) : deps.sources;
  return resolve(deps, {
    key: `live:title:${ref.kind}${ref.id}`,
    ttl: TTL.detail,
    candidates: ordered.filter((s) => s.supports(ref)).map((source) => ({ source, run: (signal: AbortSignal) => source.byRef(ref, signal) })),
  });
}

export async function getRelated(deps: Deps, ref: Ref, limit: number): Promise<Outcome<LiveTitle[]>> {
  const candidates: Candidate<LiveTitle[]>[] = candidatesFor(deps, ref, (s, signal) => s.related(ref, limit, signal));
  // An AniList title can still get Jikan recommendations through its MyAnimeList id, if AniList itself is unavailable.
  if (ref.kind === 'a') {
    for (const source of deps.sources) {
      if (source.supports(ref) || !source.supports({ kind: 'm', id: 1 })) continue;
      candidates.push({
        source,
        run: async (signal) => {
          const title = await getTitle(deps, ref);
          if (title.value.malId === null) throw new ProviderError('unavailable', 'No MyAnimeList id is known for this title.');
          return source.related({ kind: 'm', id: title.value.malId }, limit, signal);
        },
      });
    }
  }
  return resolve(deps, { key: `live:related:${ref.kind}${ref.id}:${limit}`, ttl: TTL.related, candidates });
}

export type EpisodesOutcome = { page: EpisodePage; via: SourceId | null; degraded: boolean; stale: boolean };

export async function getEpisodes(deps: Deps, ref: Ref, page: number): Promise<EpisodesOutcome> {
  const source = deps.sources.find((s) => s.episodes !== undefined);
  if (!source || !source.episodes) return { page: { items: [], hasNextPage: false, total: 0 }, via: null, degraded: false, stale: false };
  const malId = ref.kind === 'm' ? ref.id : (await getTitle(deps, ref)).value.malId;
  if (malId === null) return { page: { items: [], hasNextPage: false, total: 0 }, via: null, degraded: false, stale: false };
  const fetchEpisodes = source.episodes.bind(source);
  const out = await resolve(deps, {
    key: `live:episodes:${malId}:${page}`,
    ttl: TTL.episodes,
    candidates: [{ source, run: (signal) => fetchEpisodes(malId, page, signal) }],
  });
  return { page: out.value, via: out.via, degraded: out.degraded, stale: out.stale };
}

const FACTORIES: Record<SourceId, (f: FetchLike) => CatalogSource> = { anilist: (f) => createAniListSource(f), jikan: (f) => createJikanSource(f) };

export function parseSourceList(csv: string | undefined): SourceId[] {
  const wanted = (csv ?? 'anilist,jikan').split(',').map((s) => s.trim().toLowerCase()).filter((s): s is SourceId => s in FACTORIES);
  return wanted.length > 0 ? [...new Set(wanted)] : ['anilist', 'jikan'];
}

export function buildDeps(env: LiveEnv, fetchImpl: FetchLike, onError?: Deps['onError']): Deps {
  return {
    sources: parseSourceList(env.LIVE_PROVIDERS).map((id) => FACTORIES[id](fetchImpl)),
    cache: createCache(env),
    breaker: sharedBreaker,
    now: Date.now,
    onError,
  };
}
