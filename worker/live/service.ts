// Orchestration for the live catalogue: cache first, providers in priority order, failover, and stale-on-error.
// Provider responses are only ever kept in the short-lived cache (see metadata/cache.ts); nothing is written to D1.
import type { CircuitBreaker } from '../metadata/breaker';
import type { MetadataCache } from '../metadata/cache';
import { sharedBreaker, createCache } from '../metadata/service';
import type { FetchLike } from '../metadata/providers/http';
import { ProviderError, type EpisodePage, type EpisodeProvider, type EpisodeRecord, type EpisodeServer } from '../metadata/types';
import { buildEpisodeProviders, listEpisodes as resolveEpisodes } from '../episodes/service';
import { createAniListSource } from './anilist';
import { createJikanSource } from './jikan';
import { createHiAnimeSource } from './hianime';
import { createTmdbArtworkProvider } from '../artwork/tmdb';
import { buildZokoAnimeEmbedUrl, type ZokoAnimeTrack } from '../providers/zokoanime';
import { enrichArtwork, enrichArtworkOne, enrichEpisodeArtwork } from '../artwork/service';
import type { Ref } from './ids';
import type { BrowseQuery, CatalogSource, ListKind, LiveEnv, LiveTitle, Paged, SourceId } from './types';

export type Deps = {
  sources: CatalogSource[];
  episodeProviders: EpisodeProvider[];
  unknownEpisodeProviders: string[];
  cache: MetadataCache;
  breaker: CircuitBreaker;
  now: () => number;
  timeoutMs?: number;
  onError?: (source: SourceId, error: ProviderError) => void;
  onEpisodeError?: (source: string, error: ProviderError) => void;
  artworkProvider?: ReturnType<typeof createTmdbArtworkProvider>;
  /** Explicit opt-in; false/undefined keeps the external ZokoAnime iframe route unavailable. */
  zokoAnimeEmbedEnabled?: boolean;
};

/** Artwork enrichment is deliberately independent from the catalogue provider and fails open. */
export function withArtwork(deps: Deps, titles: LiveTitle[]): Promise<LiveTitle[]> {
  return enrichArtwork(titles, deps.artworkProvider, deps.cache);
}

export function titleWithArtwork(deps: Deps, title: LiveTitle): Promise<LiveTitle> {
  return enrichArtworkOne(title, deps.artworkProvider, deps.cache);
}

/** Episode still enrichment is independent of HiAnime episode discovery and fails open. */
export function withEpisodeArtwork(deps: Deps, title: LiveTitle, episodes: EpisodeRecord[]): Promise<EpisodeRecord[]> {
  return enrichEpisodeArtwork(title, episodes, deps.artworkProvider, deps.cache);
}

/** Fresh = served without calling a provider. Stale = only used when every provider fails. All values are seconds. */
export const TTL = {
  // Featured lists are keyed by UTC day. A new daily lineup is fetched once per day.
  featured: { fresh: 86_400, stale: 172_800 },
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

type ResolveSpec<T> = {
  key: string;
  ttl: { fresh: number; stale: number };
  candidates: Candidate<T>[];
  /** Search may continue to the next catalogue when a provider successfully returns zero matches. */
  fallbackWhenEmpty?: (value: T) => boolean;
};

export function resolve<T>(deps: Deps, spec: ResolveSpec<T>): Promise<Outcome<T>> {
  const existing = inflight.get(spec.key);
  if (existing) return existing as Promise<Outcome<T>>;
  const p = doResolve(deps, spec).finally(() => inflight.delete(spec.key));
  inflight.set(spec.key, p as Promise<Outcome<unknown>>);
  return p;
}

async function doResolve<T>(deps: Deps, spec: ResolveSpec<T>): Promise<Outcome<T>> {
  const first = spec.candidates[0];
  if (!first) throw new ProviderError('not_found', 'No provider can serve this request.');
  const primary = first.source.id;
  const cached = await deps.cache.get<Entry<T>>(spec.key);
  if (cached && cached.freshUntil > deps.now()) {
    return { value: cached.value, via: cached.via, primary, cached: true, stale: false, degraded: cached.via !== primary };
  }

  let lastError: ProviderError | null = null;
  let lastEmpty: { value: T; via: SourceId } | null = null;
  for (let index = 0; index < spec.candidates.length; index += 1) {
    const cand = spec.candidates[index]!;
    const id = cand.source.id;
    if (!deps.breaker.canRequest(id, deps.now())) {
      lastError ??= new ProviderError('unavailable', `${cand.source.displayName} is temporarily paused after repeated failures.`);
      continue;
    }
    try {
      const value = await withTimeout(deps.timeoutMs ?? 8000, cand.run);
      deps.breaker.recordSuccess(id);
      if (spec.fallbackWhenEmpty?.(value) && index < spec.candidates.length - 1) {
        lastEmpty = { value, via: id };
        continue;
      }
      const t = deps.now();
      const fresh = id === primary ? spec.ttl.fresh : Math.min(spec.ttl.fresh, FALLBACK_FRESH_SECONDS);
      const entry: Entry<T> = { value, via: id, freshUntil: t + fresh * 1000, staleUntil: t + spec.ttl.stale * 1000 };
      await deps.cache.put(spec.key, entry, spec.ttl.stale);
      return { value, via: id, primary, cached: false, stale: false, degraded: id !== primary };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError('unavailable', 'Unexpected provider failure.');
      // A missing title is final; list/search providers signal no matches with an empty page instead.
      if (err.kind === 'not_found') { deps.breaker.recordSuccess(id); throw err; }
      deps.breaker.recordFailure(id, deps.now(), err.retryAfterSeconds);
      deps.onError?.(id, err);
      lastError = err;
    }
  }
  // A healthy primary returning no search matches is still a valid answer if every fallback fails.
  if (lastEmpty) {
    const t = deps.now();
    const fresh = lastEmpty.via === primary ? spec.ttl.fresh : Math.min(spec.ttl.fresh, FALLBACK_FRESH_SECONDS);
    const entry: Entry<T> = { value: lastEmpty.value, via: lastEmpty.via, freshUntil: t + fresh * 1000, staleUntil: t + spec.ttl.stale * 1000 };
    await deps.cache.put(spec.key, entry, spec.ttl.stale);
    return { value: lastEmpty.value, via: lastEmpty.via, primary, cached: false, stale: false, degraded: lastEmpty.via !== primary };
  }
  if (cached && cached.staleUntil > deps.now()) {
    return { value: cached.value, via: cached.via, primary, cached: true, stale: true, degraded: true };
  }
  throw lastError ?? new ProviderError('unavailable', 'No data provider is available.');
}

const candidatesFor = <T>(deps: Deps, ref: Ref, run: (s: CatalogSource, signal: AbortSignal) => Promise<T>): Candidate<T>[] =>
  deps.sources.filter((s) => s.supports(ref)).map((source) => ({ source, run: (signal) => run(source, signal) }));

// Version and provider order are part of every live cache key. This prevents
// pre-AniList HiAnime ids in KV from being served after the catalogue changes.
const liveCacheScope = (deps: Deps): string => `live:v3:${deps.sources.map((source) => source.id).join(',') || 'none'}`;

export function getList(deps: Deps, kind: ListKind, page: number, limit: number): Promise<Outcome<Paged>> {
  const day = kind === 'featured' ? new Date(deps.now()).toISOString().slice(0, 10) : 'stable';
  return resolve(deps, {
    key: `${liveCacheScope(deps)}:list:${kind}:${day}:${page}:${limit}`,
    ttl: kind === 'featured' ? TTL.featured : kind === 'latest' ? TTL.latest : TTL.list,
    candidates: deps.sources.map((source) => ({ source, run: (signal) => source.list(kind, page, limit, signal) })),
  });
}

export function browse(deps: Deps, q: BrowseQuery): Promise<Outcome<Paged>> {
  const key = ['browse', q.q?.trim().toLowerCase() ?? '', q.sort, q.genre ?? '', q.year ?? '', q.format ?? '', q.status ?? '', q.season ?? '', q.page, q.limit].join('|');
  return resolve(deps, {
    key: `${liveCacheScope(deps)}:browse:${encodeURIComponent(key)}`,
    ttl: q.q ? TTL.search : TTL.list,
    candidates: deps.sources.map((source) => ({ source, run: (signal) => source.browse(q, signal) })),
    fallbackWhenEmpty: q.q?.trim() || q.season ? (value) => value.items.length === 0 : undefined,
  });
}

export function getGenres(deps: Deps): Promise<Outcome<{ name: string; count: number }[]>> {
  return resolve(deps, {
    key: `${liveCacheScope(deps)}:genres`,
    ttl: TTL.genres,
    candidates: deps.sources.map((source) => ({ source, run: (signal) => source.genres(signal) })),
  });
}

export function getTitle(deps: Deps, ref: Ref): Promise<Outcome<LiveTitle>> {
  // MyAnimeList ids try Jikan first. AniList ids can only come from AniList.
  const ordered = ref.kind === 'm' ? [...deps.sources].sort((a, b) => Number(b.id === 'jikan') - Number(a.id === 'jikan')) : deps.sources;
  return resolve(deps, {
    key: `${liveCacheScope(deps)}:title:${ref.kind}${ref.id}`,
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
  return resolve(deps, { key: `${liveCacheScope(deps)}:related:${ref.kind}${ref.id}:${limit}`, ttl: TTL.related, candidates });
}

export type EpisodesOutcome = { page: EpisodePage; via: string | null; degraded: boolean; stale: boolean; cached: boolean };

export async function getEpisodes(deps: Deps, ref: Ref, page: number): Promise<EpisodesOutcome> {
  if (deps.episodeProviders.length === 0) {
    return { page: { items: [], hasNextPage: false, total: 0 }, via: null, degraded: false, stale: false, cached: false };
  }

  const title = (await getTitle(deps, ref)).value;
  const lookup = {
    cacheKey: `${ref.kind}${ref.id}`,
    title: title.card.title,
    alternateTitles: title.altTitles,
    externalIds: {
      ...(title.anilistId ? { anilist: String(title.anilistId) } : {}),
      ...(title.malId ? { mal: String(title.malId) } : {}),
    },
    providerUrl: title.url,
  };
  const out = await resolveEpisodes({
    providers: deps.episodeProviders, cache: deps.cache, breaker: deps.breaker, now: deps.now,
    timeoutMs: deps.timeoutMs, onError: deps.onEpisodeError,
  }, lookup, page);
  return { page: out.page, via: out.via, degraded: out.degraded, stale: out.stale, cached: out.cached };
}

/** Resolve a selected server only after re-discovering it for the requested episode.
 * The browser supplies an episode number and opaque server id, never a media URL.
 */
export async function getEpisodePlayback(deps: Deps, ref: Ref, episodeNumber: number, serverId: string) {
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 100_000 ||
      typeof serverId !== 'string' || !/^(?:\d{1,12}|h_[A-Za-z0-9_-]{1,1800}|z_(?:sub|hsub|dub))$/.test(serverId)) {
    throw new ProviderError('not_found', 'Invalid episode or server identifier.');
  }
  const title = (await getTitle(deps, ref)).value;
  const lookup = {
    cacheKey: `${ref.kind}${ref.id}`,
    title: title.card.title,
    alternateTitles: title.altTitles,
    externalIds: {
      ...(title.anilistId ? { anilist: String(title.anilistId) } : {}),
      ...(title.malId ? { mal: String(title.malId) } : {}),
    },
    providerUrl: title.url,
  };
  if (serverId.startsWith('z_')) {
    if (!deps.zokoAnimeEmbedEnabled) throw new ProviderError('unavailable', 'ZokoAnime iframe playback is disabled until its terms and permissions are reviewed.');
    const track = serverId.slice(2) as ZokoAnimeTrack;
    const embedUrl = buildZokoAnimeEmbedUrl({ malId: title.malId, anilistId: title.anilistId, episodeNumber, track });
    if (!embedUrl) throw new ProviderError('not_found', 'ZokoAnime does not have a usable external title id for this episode.');

    // Re-confirm that this episode is in the configured episode catalogue before
    // producing the external iframe URL. The browser still supplies only an opaque server id.
    const episodeProvider = deps.episodeProviders.find((item) => typeof item.listServers === 'function');
    if (!episodeProvider?.listServers) throw new ProviderError('unavailable', 'No episode discovery provider is enabled for ZokoAnime playback.');
    const breakerKey = `episode:${episodeProvider.id}`;
    if (!deps.breaker.canRequest(breakerKey, deps.now())) {
      throw new ProviderError('unavailable', `${episodeProvider.displayName} is temporarily paused after repeated failures.`);
    }
    try {
      for (let page = 1; page <= 20; page++) {
        const episodes = await withTimeout(deps.timeoutMs ?? 8000, (signal) => episodeProvider.listEpisodes(lookup, page, signal));
        const match = episodes.items.find((item) => item.episodeNumber === episodeNumber);
        if (match?.providerEpisodeId) {
          await withTimeout(deps.timeoutMs ?? 8000, (signal) => episodeProvider.listServers!(match.providerEpisodeId!, lookup, signal));
          deps.breaker.recordSuccess(breakerKey);
          return { provider: 'zokoanime', protocol: 'embed' as const, embedUrl };
        }
        if (!episodes.hasNextPage) break;
      }
      deps.breaker.recordSuccess(breakerKey);
      throw new ProviderError('not_found', 'The selected episode is not listed by the configured episode provider.');
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'not_found') throw error;
      const providerError = error instanceof ProviderError ? error : new ProviderError('unavailable', 'Unexpected episode validation failure.');
      deps.breaker.recordFailure(breakerKey, deps.now(), providerError.retryAfterSeconds);
      deps.onEpisodeError?.(episodeProvider.id, providerError);
      throw providerError;
    }
  }
  const provider = deps.episodeProviders.find((item) => typeof item.listServers === 'function' && typeof item.resolveServer === 'function');
  if (!provider?.listServers || !provider.resolveServer) throw new ProviderError('unavailable', 'No approved playback resolver is configured.');
  const breakerKey = `episode:${provider.id}`;
  if (!deps.breaker.canRequest(breakerKey, deps.now())) throw new ProviderError('unavailable', `${provider.displayName} is temporarily paused after repeated failures.`);
  try {
    for (let page = 1; page <= 20; page++) {
      const episodes = await withTimeout(deps.timeoutMs ?? 8000, (signal) => provider.listEpisodes(lookup, page, signal));
      const episode = episodes.items.find((item) => item.episodeNumber === episodeNumber);
      if (episode?.providerEpisodeId) {
        const providerEpisodeId = episode.providerEpisodeId;
        const servers = await withTimeout(deps.timeoutMs ?? 8000, (signal) => provider.listServers!(providerEpisodeId, lookup, signal));
        if (!servers.some((server) => server.id === serverId)) throw new ProviderError('not_found', 'The selected server is not listed for this episode.');
        const raw = await withTimeout(deps.timeoutMs ?? 8000, (signal) => provider.resolveServer!(serverId, lookup, signal, providerEpisodeId));
        if (raw === null || raw === undefined) throw new ProviderError('unavailable', 'The provider did not return an approved playable source.');
        deps.breaker.recordSuccess(breakerKey);
        return raw;
      }
      if (!episodes.hasNextPage) break;
    }
    throw new ProviderError('not_found', 'The requested episode was not found.');
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'not_found') throw error;
    const providerError = error instanceof ProviderError ? error : new ProviderError('unavailable', 'Unexpected playback resolver failure.');
    deps.breaker.recordFailure(breakerKey, deps.now(), providerError.retryAfterSeconds);
    deps.onEpisodeError?.(provider.id, providerError);
    throw providerError;
  }
}

export async function getEpisodeServers(deps: Deps, ref: Ref, episodeNumber: number) {
  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0 || episodeNumber > 100_000) throw new ProviderError('not_found', 'Invalid episode number.');
  const title = (await getTitle(deps, ref)).value;
  const lookup = {
    cacheKey: `${ref.kind}${ref.id}`,
    title: title.card.title,
    alternateTitles: title.altTitles,
    externalIds: {
      ...(title.anilistId ? { anilist: String(title.anilistId) } : {}),
      ...(title.malId ? { mal: String(title.malId) } : {}),
    },
    providerUrl: title.url,
  };
  const provider = deps.episodeProviders.find((item) => typeof item.listServers === 'function');
  if (!provider?.listServers) throw new ProviderError('unavailable', 'No episode server-discovery provider is enabled.');
  const breakerKey = `episode:${provider.id}`;
  if (!deps.breaker.canRequest(breakerKey, deps.now())) throw new ProviderError('unavailable', `${provider.displayName} is temporarily paused after repeated failures.`);
  try {
    // HiAnime returns the episode list as one page; page through providers that split long-running shows.
    for (let page = 1; page <= 20; page++) {
      const episodes = await withTimeout(deps.timeoutMs ?? 8000, (signal) => provider.listEpisodes(lookup, page, signal));
      const match = episodes.items.find((item) => item.episodeNumber === episodeNumber);
      if (match?.providerEpisodeId) {
        const items = await withTimeout(deps.timeoutMs ?? 8000, (signal) => provider.listServers!(match.providerEpisodeId!, lookup, signal));
        deps.breaker.recordSuccess(breakerKey);
        const zokoItems: EpisodeServer[] = deps.zokoAnimeEmbedEnabled && (title.malId || title.anilistId)
          ? (['sub', 'hsub', 'dub'] as const).map((track) => ({
              id: `z_${track}`,
              type: track,
              name: `ZokoAnime · ${track === 'sub' ? 'Sub' : track === 'hsub' ? 'Hard Sub' : 'Dub'}`,
            }))
          : [];
        const seen = new Set(items.map((server) => server.id));
        return { items: [...items, ...zokoItems.filter((server) => !seen.has(server.id))], via: provider.id };
      }
      if (!episodes.hasNextPage) break;
    }
    deps.breaker.recordSuccess(breakerKey);
    throw new ProviderError('not_found', 'The requested episode was not found by the server-discovery provider.');
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'not_found') throw error;
    const providerError = error instanceof ProviderError ? error : new ProviderError('unavailable', 'Unexpected episode server-discovery failure.');
    deps.breaker.recordFailure(breakerKey, deps.now(), providerError.retryAfterSeconds);
    deps.onEpisodeError?.(provider.id, providerError);
    throw providerError;
  }
}

const FACTORIES: Record<SourceId, (f: FetchLike, baseUrl?: string) => CatalogSource> = { anilist: (f) => createAniListSource(f), jikan: (f) => createJikanSource(f), hianime: (f, baseUrl) => createHiAnimeSource(f, baseUrl) };

export function parseSourceList(csv: string | undefined): SourceId[] {
  const wanted = (csv ?? 'anilist,jikan').split(',').map((s) => s.trim().toLowerCase()).filter((s): s is SourceId => s in FACTORIES);
  return wanted.length > 0 ? [...new Set(wanted)] : ['anilist', 'jikan'];
}

export function buildDeps(env: LiveEnv, fetchImpl: FetchLike, onError?: Deps['onError']): Deps {
  const playbackHosts = (env.HIANIME_PLAYBACK_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim().toLowerCase()).filter((host) => /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host));
  const episodeRegistry = buildEpisodeProviders(env.EPISODE_PROVIDERS, env.HIANIME_BASE_URL, fetchImpl, playbackHosts);
  return {
    sources: parseSourceList(env.LIVE_PROVIDERS).map((id) => FACTORIES[id](fetchImpl, env.HIANIME_BASE_URL)),
    episodeProviders: episodeRegistry.providers,
    unknownEpisodeProviders: episodeRegistry.unknown,
    cache: createCache(env),
    breaker: sharedBreaker,
    now: Date.now,
    onError,
    zokoAnimeEmbedEnabled: env.ZOKOANIME_EMBED_ENABLED === 'true',
    ...(env.TMDB_ACCESS_TOKEN?.trim() ? { artworkProvider: createTmdbArtworkProvider(fetchImpl, env.TMDB_ACCESS_TOKEN) } : {}),
    onEpisodeError: (source, error) => console.error(JSON.stringify({ event: 'episode_provider_failed', source, kind: error.kind })),
  };
}
