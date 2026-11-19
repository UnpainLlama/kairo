# worker/metadata/ — folder index

## Purpose

Provider-neutral Anime metadata normalization/cache/match/merge/enrichment or legacy D1 metadata implementation.

## Direct files

- [breaker.ts](breaker.ts) — guide: breaker_readme.md.
- [cache.ts](cache.ts) — guide: cache_readme.md.
- [enrich.test.ts](enrich.test.ts) — guide: enrich.test_readme.md.
- [enrich.ts](enrich.ts) — guide: enrich_readme.md.
- [match.test.ts](match.test.ts) — guide: match.test_readme.md.
- [match.ts](match.ts) — guide: match_readme.md.
- [merge.test.ts](merge.test.ts) — guide: merge.test_readme.md.
- [merge.ts](merge.ts) — guide: merge_readme.md.
- [normalize.test.ts](normalize.test.ts) — guide: normalize.test_readme.md.
- [normalize.ts](normalize.ts) — guide: normalize_readme.md.
- [providers.test.ts](providers.test.ts) — guide: providers.test_readme.md.
- [route.test.ts](route.test.ts) — guide: route.test_readme.md.
- [service.ts](service.ts) — guide: service_readme.md.
- [types.ts](types.ts) — guide: types_readme.md.

## Child folders

- [providers/](providers/_readme.md)

## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.