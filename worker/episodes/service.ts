import type { CircuitBreaker } from '../metadata/breaker';
import type { MetadataCache } from '../metadata/cache';
import { ProviderError, type EpisodeLookup, type EpisodePage, type EpisodeProvider } from '../metadata/types';
import type { FetchLike } from '../metadata/providers/http';
import type { LiveEnv } from '../live/types';
import { createHiAnimeEpisodeProvider } from './providers/hianime';
import { createJikanEpisodeProvider } from './providers/jikan';

export type EpisodeServiceDeps = {
  providers: EpisodeProvider[];
  cache: MetadataCache;
  breaker: CircuitBreaker;
  now: () => number;
  timeoutMs?: number;
  onError?: (provider: string, error: ProviderError) => void;
};

export type EpisodeOutcome = { page: EpisodePage; via: string | null; degraded: boolean; stale: boolean; cached: boolean };

type CacheEntry = { page: EpisodePage; via: string; freshUntil: number; staleUntil: number };
const FRESH_SECONDS = 6 * 60 * 60;
const STALE_SECONDS = 24 * 60 * 60;
const FALLBACK_FRESH_SECONDS = 5 * 60;
const inflight = new Map<string, Promise<EpisodeOutcome>>();
const emptyPage = (): EpisodePage => ({ items: [], hasNextPage: false, total: 0 });

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fn(controller.signal); }
  finally { clearTimeout(timer); }
}

export function buildEpisodeProviders(csv: string | undefined, hianimeBaseUrl: string | undefined, fetchImpl: FetchLike): { providers: EpisodeProvider[]; unknown: string[] } {
  const requested = (csv === undefined ? 'jikan' : csv).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const factories: Record<string, () => EpisodeProvider> = {
    hianime: () => createHiAnimeEpisodeProvider(fetchImpl, hianimeBaseUrl),
    jikan: () => createJikanEpisodeProvider(fetchImpl),
  };
  const unknown = [...new Set(requested.filter((id) => !(id in factories)))];
  const providers: EpisodeProvider[] = [];
  for (const id of [...new Set(requested)]) {
    const factory = factories[id];
    if (!factory) continue;
    try { providers.push(factory()); }
    catch {
      // A bad provider-specific setting should be visible as an unknown/configuration failure, not crash Worker startup.
      unknown.push(`${id}:configuration`);
    }
  }
  return { providers, unknown };
}

export async function listEpisodes(deps: EpisodeServiceDeps, lookup: EpisodeLookup, page: number): Promise<EpisodeOutcome> {
  const first = deps.providers[0];
  if (!first) return { page: emptyPage(), via: null, degraded: false, stale: false, cached: false };

  const key = `episodes:${lookup.cacheKey}:${page}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = resolveEpisodes(deps, lookup, page, key, first).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

async function resolveEpisodes(deps: EpisodeServiceDeps, lookup: EpisodeLookup, page: number, key: string, primary: EpisodeProvider): Promise<EpisodeOutcome> {
  const cached = await deps.cache.get<CacheEntry>(key);
  if (cached && cached.freshUntil > deps.now()) {
    return { page: cached.page, via: cached.via, degraded: cached.via !== primary.id, stale: false, cached: true };
  }

  let lastError: ProviderError | null = null;
  let foundNotFound = false;
  for (const provider of deps.providers) {
    // Keep episode-provider health isolated from the same provider's catalogue/metadata adapter.
    const breakerKey = `episode:${provider.id}`;
    if (!deps.breaker.canRequest(breakerKey, deps.now())) {
      lastError ??= new ProviderError('unavailable', `${provider.displayName} is temporarily paused after repeated failures.`);
      continue;
    }
    try {
      const pageData = await withTimeout(deps.timeoutMs ?? 8000, (signal) => provider.listEpisodes(lookup, page, signal));
      if (!Array.isArray(pageData.items) || typeof pageData.hasNextPage !== 'boolean') throw new ProviderError('invalid_response', 'Episode provider returned an invalid page.');
      deps.breaker.recordSuccess(breakerKey);
      const now = deps.now();
      const freshSeconds = provider.id === primary.id ? FRESH_SECONDS : FALLBACK_FRESH_SECONDS;
      const entry: CacheEntry = { page: pageData, via: provider.id, freshUntil: now + freshSeconds * 1000, staleUntil: now + STALE_SECONDS * 1000 };
      await deps.cache.put(key, entry, STALE_SECONDS);
      return { page: pageData, via: provider.id, degraded: provider.id !== primary.id, stale: false, cached: false };
    } catch (error) {
      const providerError = error instanceof ProviderError ? error : new ProviderError('unavailable', 'Unexpected episode-provider failure.');
      if (providerError.kind === 'not_found') {
        foundNotFound = true;
        deps.breaker.recordSuccess(breakerKey);
        continue;
      }
      deps.breaker.recordFailure(breakerKey, deps.now(), providerError.retryAfterSeconds);
      deps.onError?.(provider.id, providerError);
      lastError = providerError;
    }
  }

  if (cached && cached.staleUntil > deps.now()) {
    return { page: cached.page, via: cached.via, degraded: true, stale: true, cached: true };
  }
  if (foundNotFound && !lastError) return { page: emptyPage(), via: null, degraded: false, stale: false, cached: false };
  throw lastError ?? new ProviderError('unavailable', 'No episode provider is available.');
}

export type { EpisodePage };
