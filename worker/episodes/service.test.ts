import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../metadata/breaker';
import { MemoryCache } from '../metadata/cache';
import { ProviderError, type EpisodeLookup, type EpisodeProvider } from '../metadata/types';
import { buildEpisodeProviders, listEpisodes } from './service';

const lookup: EpisodeLookup = { cacheKey: 'm1535', title: 'Death Note', alternateTitles: [], externalIds: { mal: '1535' } };
const page = { items: [{ episodeNumber: 1, title: 'Pilot', airedAt: null, synopsis: '', durationSeconds: null }], hasNextPage: false, total: 1 };

function provider(id: string, run: EpisodeProvider['listEpisodes']): EpisodeProvider {
  return { id, displayName: id, termsVerified: false, listEpisodes: run };
}

describe('episode provider registry', () => {
  it('enables configured providers in order and reports unknown identifiers', () => {
    const registry = buildEpisodeProviders('hianime,jikan,missing', 'https://hianimez.to', async () => new Response(''));
    expect(registry.providers.map((p) => p.id)).toEqual(['hianime', 'jikan']);
    expect(registry.unknown).toEqual(['missing']);
    expect(buildEpisodeProviders('', undefined, fetch).providers).toEqual([]);
  });
});

describe('episode discovery orchestration', () => {
  it('falls back from HiAnime failure to Jikan and marks the result degraded', async () => {
    const calls: string[] = [];
    const hianime = provider('hianime', async () => { calls.push('hianime'); throw new ProviderError('unavailable', 'upstream down'); });
    const jikan = provider('jikan', async () => { calls.push('jikan'); return page; });
    const out = await listEpisodes({ providers: [hianime, jikan], cache: new MemoryCache(), breaker: new CircuitBreaker(), now: Date.now }, lookup, 1);
    expect(calls).toEqual(['hianime', 'jikan']);
    expect(out).toMatchObject({ page, via: 'jikan', degraded: true, stale: false, cached: false });
  });

  it('keeps the episode circuit breaker separate from the catalogue provider breaker', async () => {
    const breaker = new CircuitBreaker();
    breaker.recordFailure('jikan', Date.now(), 600);
    let calls = 0;
    const jikan = provider('jikan', async () => { calls++; return page; });
    await listEpisodes({ providers: [jikan], cache: new MemoryCache(), breaker, now: Date.now }, lookup, 1);
    expect(calls).toBe(1);
  });

  it('uses cached pages without contacting a provider again', async () => {
    let calls = 0;
    const cache = new MemoryCache();
    const p = provider('hianime', async () => { calls++; return page; });
    const deps = { providers: [p], cache, breaker: new CircuitBreaker(), now: Date.now };
    await listEpisodes(deps, lookup, 1);
    const cached = await listEpisodes(deps, lookup, 1);
    expect(calls).toBe(1);
    expect(cached).toMatchObject({ via: 'hianime', cached: true });
  });

  it('returns an empty page for a genuine not-found response but surfaces upstream outages', async () => {
    const missing = provider('hianime', async () => { throw new ProviderError('not_found', 'not listed'); });
    const empty = await listEpisodes({ providers: [missing], cache: new MemoryCache(), breaker: new CircuitBreaker(), now: Date.now }, lookup, 1);
    expect(empty).toMatchObject({ page: { items: [], hasNextPage: false, total: 0 }, via: null });

    const broken = provider('hianime', async () => { throw new ProviderError('unavailable', 'offline'); });
    await expect(listEpisodes({ providers: [broken], cache: new MemoryCache(), breaker: new CircuitBreaker(), now: Date.now }, lookup, 1)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
