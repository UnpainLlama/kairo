// Provider fallback, caching and ID mapping. Every provider is optional: if one fails, is rate limited or is switched off,
// the others (and the stored catalogue row) still produce an answer, and the outcome of each provider is reported.
import { CircuitBreaker } from './breaker';
import { DEFAULT_TTLS, type CacheTtls, type MetadataCache } from './cache';
import { pickBest, type MatchSubject } from './match';
import { titleKey } from './normalize';
import { ProviderError, type BaseRecord, type MetadataProvider, type NormalizedMetadata } from './types';

export type OutcomeState = 'ok' | 'cached' | 'not_found' | 'skipped' | 'failed';
export type ProviderOutcome = {
  provider: string;
  state: OutcomeState;
  reason?: string;
  matchedBy?: 'id' | 'title';
  confidence?: number;
};
export type DiscoveredId = { provider: string; externalId: string; confidence: number };

export type EnrichDeps = {
  cache: MetadataCache;
  breaker: CircuitBreaker;
  now?: () => number;
  timeoutMs?: number;
  ttls?: CacheTtls;
};

type CachedEntry<T> = { kind: 'hit'; value: T } | { kind: 'miss' };

const subjectOfBase = (b: BaseRecord): MatchSubject => ({ ids: b.knownIds, titles: [b.title, ...b.altTitles], year: b.year, format: b.format, episodeCount: b.episodeCount });
const subjectOfMeta = (m: NormalizedMetadata): MatchSubject => ({
  ids: m.ids, titles: [m.title, m.titleEnglish, m.titleRomaji, m.titleNative, ...m.synonyms].filter((t): t is string => !!t), year: m.year, format: m.format, episodeCount: m.episodeCount,
});

/** Hard deadline: the request is abandoned even if the provider code ignores the abort signal. */
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new ProviderError('unavailable', 'The provider timed out.')); }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function enrichFromProviders(
  base: BaseRecord,
  providers: MetadataProvider[],
  deps: EnrichDeps,
): Promise<{ results: NormalizedMetadata[]; outcomes: ProviderOutcome[]; discovered: DiscoveredId[] }> {
  const now = deps.now ?? Date.now;
  const ttls = deps.ttls ?? DEFAULT_TTLS;
  const timeoutMs = deps.timeoutMs ?? 6000;

  const perProvider = await Promise.all(providers.map(async (provider) => {
    const outcome: ProviderOutcome = { provider: provider.id, state: 'failed' };
    const discovered: DiscoveredId[] = [];
    if (!deps.breaker.canRequest(provider.id, now())) return { outcome: { ...outcome, state: 'skipped' as const, reason: 'circuit_open' }, result: null, discovered };

    try {
      const knownId = base.knownIds[provider.id];
      let result: NormalizedMetadata | null = null;

      if (knownId && provider.capabilities.byId) {
        const key = `meta:v1:${provider.id}:id:${knownId}`;
        const cached = await deps.cache.get<CachedEntry<NormalizedMetadata>>(key);
        if (cached) {
          outcome.state = cached.kind === 'hit' ? 'cached' : 'not_found';
          result = cached.kind === 'hit' ? cached.value : null;
        } else {
          try {
            result = await withTimeout(timeoutMs, (s) => provider.fetchById(knownId, s));
            await deps.cache.put(key, { kind: 'hit', value: result } satisfies CachedEntry<NormalizedMetadata>, ttls.hitSeconds);
            outcome.state = 'ok';
          } catch (error) {
            if (error instanceof ProviderError && error.kind === 'not_found') {
              await deps.cache.put(key, { kind: 'miss' } satisfies CachedEntry<NormalizedMetadata>, ttls.missSeconds);
              outcome.state = 'not_found';
            } else throw error;
          }
        }
        outcome.matchedBy = 'id';
        outcome.confidence = 1;
      } else if (provider.capabilities.search) {
        const key = `meta:v1:${provider.id}:search:${titleKey(base.title)}:${base.year ?? ''}`;
        let candidates = await deps.cache.get<NormalizedMetadata[]>(key);
        const fromCache = candidates !== null;
        if (!candidates) {
          candidates = await withTimeout(timeoutMs, (s) => provider.search(base.title, s, 8));
          await deps.cache.put(key, candidates, candidates.length ? ttls.hitSeconds : ttls.missSeconds);
        }
        const best = pickBest(subjectOfBase(base), candidates, subjectOfMeta);
        if (best) {
          result = best.candidate;
          outcome.state = fromCache ? 'cached' : 'ok';
          outcome.matchedBy = 'title';
          outcome.confidence = best.score;
          discovered.push({ provider: provider.id, externalId: best.candidate.externalId, confidence: best.score });
        } else {
          outcome.state = 'not_found';
          outcome.reason = 'no_confident_match';
        }
      } else {
        outcome.state = 'skipped';
        outcome.reason = 'provider_cannot_look_up_this_title';
      }
      deps.breaker.recordSuccess(provider.id);
      return { outcome, result, discovered };
    } catch (error) {
      const kind = error instanceof ProviderError ? error.kind : 'unavailable';
      deps.breaker.recordFailure(provider.id, now(), error instanceof ProviderError ? error.retryAfterSeconds : undefined);
      return { outcome: { provider: provider.id, state: 'failed' as const, reason: kind }, result: null, discovered };
    }
  }));

  return {
    results: perProvider.flatMap((p) => (p.result ? [p.result] : [])),
    outcomes: perProvider.map((p) => p.outcome),
    discovered: perProvider.flatMap((p) => p.discovered),
  };
}

/** The stored catalogue row, expressed like any other provider's answer so it takes part in merging and provenance. */
export function baseToMetadata(b: BaseRecord): NormalizedMetadata {
  return {
    provider: b.provider, externalId: b.id, ids: b.knownIds, url: null,
    title: b.title, titleEnglish: null, titleRomaji: null, titleNative: null, synonyms: b.altTitles,
    synopsis: b.synopsis || null, format: b.format, status: b.status, season: b.season, year: b.year, episodeCount: b.episodeCount,
    genres: b.genres, posterUrl: b.posterUrl, bannerUrl: b.bannerUrl, rating: b.rating, fetchedAt: b.updatedAt,
  };
}
