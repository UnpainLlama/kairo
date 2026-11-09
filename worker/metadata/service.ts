// Wiring: which providers are on, which cache is used, and how the unified response is assembled.
import { CircuitBreaker } from './breaker';
import { EdgeCache, KvCache, MemoryCache, type KvLike, type MetadataCache } from './cache';
import { baseToMetadata, enrichFromProviders, type EnrichDeps, type ProviderOutcome } from './enrich';
import { mergeMetadata, type Unified } from './merge';
import { normalizeFormat, normalizeSeason, normalizeStatus, uniqueStrings } from './normalize';
import { ANILIST_ATTRIBUTION, createAniListProvider } from './providers/anilist';
import type { FetchLike } from './providers/http';
import { KITSU_ATTRIBUTION, createKitsuProvider } from './providers/kitsu';
import { MANAMI_ATTRIBUTION } from './providers/manami';
import type { Attribution, BaseRecord, ExternalIds, MetadataProvider } from './types';

/** Adding a provider = write an adapter and add one line here. Nothing else in the Worker or frontend changes. */
const FACTORIES: Record<string, (f: FetchLike) => MetadataProvider> = {
  anilist: createAniListProvider,
  kitsu: createKitsuProvider,
};
const ATTRIBUTIONS: Record<string, Attribution> = { anilist: ANILIST_ATTRIBUTION, kitsu: KITSU_ATTRIBUTION, manami: MANAMI_ATTRIBUTION };

export type ProviderInfo = { id: string; displayName: string; enabled: boolean; termsVerified: boolean; capabilities: { byId: boolean; search: boolean }; attribution: Attribution };

export function buildRegistry(csv: string | undefined, fetchImpl: FetchLike): { enabled: MetadataProvider[]; info: ProviderInfo[]; unknown: string[] } {
  const wanted = (csv ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = wanted.filter((id) => !(id in FACTORIES));
  const all = Object.entries(FACTORIES).map(([id, make]) => ({ id, provider: make(fetchImpl) }));
  const enabled = all.filter((p) => wanted.includes(p.id)).map((p) => p.provider);
  const info = all.map(({ provider }) => ({
    id: provider.id, displayName: provider.displayName, enabled: wanted.includes(provider.id), termsVerified: provider.termsVerified,
    capabilities: provider.capabilities, attribution: provider.attribution,
  }));
  return { enabled, info, unknown };
}

type CacheEnv = { METADATA_CACHE?: KvLike };
const memory = new MemoryCache();
export const sharedBreaker = new CircuitBreaker();

export function createCache(env: CacheEnv): MetadataCache {
  if (env.METADATA_CACHE) return new KvCache(env.METADATA_CACHE);
  const edge = (globalThis as { caches?: { default?: ConstructorParameters<typeof EdgeCache>[0] } }).caches?.default;
  return edge ? new EdgeCache(edge) : memory;
}

export type BaseRow = {
  id: string; slug: string; title: string; altTitlesJson: string; synopsis: string; posterUrl: string | null; bannerUrl: string | null;
  format: string | null; releaseYear: number | null; season: string | null; status: string | null; rating: number | null;
  episodeCount: number | null; genresJson: string; providerId: string | null; updatedAt: string;
};

const jsonStrings = (raw: string): string[] => { try { const v: unknown = JSON.parse(raw); return Array.isArray(v) ? uniqueStrings(v) : []; } catch { return []; } };

export function toBaseRecord(row: BaseRow, mappings: { provider: string; externalId: string }[]): BaseRecord {
  const knownIds: ExternalIds = {};
  for (const m of mappings) knownIds[m.provider] = m.externalId;
  return {
    id: row.id, slug: row.slug, provider: row.providerId ?? 'catalogue', title: row.title, altTitles: jsonStrings(row.altTitlesJson),
    synopsis: row.synopsis, format: normalizeFormat(row.format), status: normalizeStatus(row.status), season: normalizeSeason(row.season),
    year: row.releaseYear, episodeCount: row.episodeCount, genres: jsonStrings(row.genresJson), posterUrl: row.posterUrl, bannerUrl: row.bannerUrl,
    rating: row.rating, knownIds, updatedAt: row.updatedAt,
  };
}

export type MetadataPayload = Unified & {
  id: string; slug: string; sources: Pick<Attribution, 'providerId' | 'displayName' | 'text' | 'url' | 'license'>[]; providers: ProviderOutcome[];
};

export async function resolveUnified(base: BaseRecord, providers: MetadataProvider[], deps: EnrichDeps) {
  const enrichment = await enrichFromProviders(base, providers, deps);
  const unified = mergeMetadata([baseToMetadata(base), ...enrichment.results]);
  const sources = unified.contributors.flatMap((id) => {
    const a = ATTRIBUTIONS[id];
    return a ? [{ providerId: a.providerId, displayName: a.displayName, text: a.text, url: a.url, license: a.license }] : [];
  });
  const payload: MetadataPayload = { ...unified, id: base.id, slug: base.slug, sources, providers: enrichment.outcomes };
  return { payload, discovered: enrichment.discovered, degraded: enrichment.outcomes.some((o) => o.state === 'failed') };
}
