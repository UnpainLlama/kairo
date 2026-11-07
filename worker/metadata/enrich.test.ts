import { describe, it, expect } from 'vitest';
import { CircuitBreaker } from './breaker';
import { MemoryCache } from './cache';
import { baseToMetadata, enrichFromProviders } from './enrich';
import { ProviderError, type BaseRecord, type MetadataProvider, type NormalizedMetadata } from './types';

const base: BaseRecord = {
  id: 'a1', slug: 'death-note', provider: 'manami', title: 'Death Note', altTitles: [], synopsis: '', format: 'series', status: null, season: null,
  year: 2006, episodeCount: 37, genres: [], posterUrl: null, bannerUrl: null, rating: null, knownIds: { mal: '1535' }, updatedAt: '2026-01-01T00:00:00.000Z',
};
const result = (provider: string, over: Partial<NormalizedMetadata> = {}): NormalizedMetadata => ({
  provider, externalId: '1535', ids: { [provider]: '1535', mal: '1535' }, url: null, title: 'Death Note', titleEnglish: null, titleRomaji: null, titleNative: null,
  synonyms: [], synopsis: 'x', format: 'series', status: 'finished', season: null, year: 2006, episodeCount: 37, genres: [], posterUrl: null, bannerUrl: null, rating: null,
  fetchedAt: '2026-11-06T00:00:00.000Z', ...over,
});

function fake(id: string, impl: { byId?: () => Promise<NormalizedMetadata>; search?: () => Promise<NormalizedMetadata[]> }) {
  const calls = { byId: 0, search: 0 };
  const p: MetadataProvider = {
    id, displayName: id, capabilities: { byId: true, search: true }, termsVerified: true,
    attribution: { providerId: id, displayName: id, text: '', url: '', termsUrl: '', license: null, requirements: [] },
    fetchById: async () => { calls.byId++; return (impl.byId ?? (async () => result(id)))(); },
    search: async () => { calls.search++; return (impl.search ?? (async () => [result(id)]))(); },
  };
  return { p, calls };
}
const deps = () => ({ cache: new MemoryCache(), breaker: new CircuitBreaker(), timeoutMs: 200 });

describe('enrichFromProviders', () => {
  it('looks up by known id first, then serves repeat requests from cache', async () => {
    const d = deps();
    const a = fake('anilist', {});
    const withId = { ...base, knownIds: { anilist: '1535' } };
    const first = await enrichFromProviders(withId, [a.p], d);
    const second = await enrichFromProviders(withId, [a.p], d);
    expect(first.outcomes[0]).toMatchObject({ state: 'ok', matchedBy: 'id' });
    expect(second.outcomes[0].state).toBe('cached');
    expect(a.calls).toEqual({ byId: 1, search: 0 });
  });
  it('searches by title when no id is known, accepts a confident match and reports the discovered id', async () => {
    const a = fake('anilist', {});
    const r = await enrichFromProviders(base, [a.p], deps());
    expect(r.outcomes[0]).toMatchObject({ state: 'ok', matchedBy: 'title' });
    expect(r.discovered).toEqual([{ provider: 'anilist', externalId: '1535', confidence: 1 }]);
  });
  it('refuses a weak title-only match', async () => {
    const a = fake('anilist', { search: async () => [result('anilist', { ids: { anilist: '99' }, year: null, format: null, episodeCount: null, title: 'Death Note' })] });
    const r = await enrichFromProviders({ ...base, knownIds: {}, year: null, format: null, episodeCount: null }, [a.p], deps());
    expect(r.outcomes[0]).toMatchObject({ state: 'not_found', reason: 'no_confident_match' });
    expect(r.results).toEqual([]);
  });
  it('keeps working when one provider fails: the other still contributes and the failure is reported', async () => {
    const bad = fake('kitsu', { byId: async () => { throw new ProviderError('unavailable', 'down'); } });
    const good = fake('anilist', {});
    const r = await enrichFromProviders({ ...base, knownIds: { kitsu: '1', anilist: '2' } }, [bad.p, good.p], deps());
    expect(r.outcomes.map((o) => `${o.provider}:${o.state}`)).toEqual(['kitsu:failed', 'anilist:ok']);
    expect(r.results.map((x) => x.provider)).toEqual(['anilist']);
  });
  it('opens the circuit after a 429 and skips that provider without calling it', async () => {
    const limited = fake('anilist', { byId: async () => { throw new ProviderError('rate_limited', 'slow down', 30); } });
    const d = deps();
    const withId = { ...base, knownIds: { anilist: '1' } };
    await enrichFromProviders(withId, [limited.p], d);
    const again = await enrichFromProviders(withId, [limited.p], d);
    expect(again.outcomes[0]).toMatchObject({ state: 'skipped', reason: 'circuit_open' });
    expect(limited.calls.byId).toBe(1);
  });
  it('caches not-found so a missing id is not re-requested', async () => {
    const nf = fake('anilist', { byId: async () => { throw new ProviderError('not_found', 'none'); } });
    const d = deps();
    const withId = { ...base, knownIds: { anilist: '404' } };
    await enrichFromProviders(withId, [nf.p], d);
    const again = await enrichFromProviders(withId, [nf.p], d);
    expect(again.outcomes[0].state).toBe('not_found');
    expect(nf.calls.byId).toBe(1);
  });
  it('times out a hung provider instead of hanging the request', async () => {
    const hang = fake('anilist', { byId: () => new Promise(() => {}) });
    const r = await enrichFromProviders({ ...base, knownIds: { anilist: '1' } }, [hang.p], { ...deps(), timeoutMs: 20 });
    expect(r.outcomes[0]).toMatchObject({ state: 'failed', reason: 'unavailable' });
  });
  it('represents the stored row like any provider answer', () => {
    expect(baseToMetadata(base)).toMatchObject({ provider: 'manami', synopsis: null, title: 'Death Note' });
  });
});
