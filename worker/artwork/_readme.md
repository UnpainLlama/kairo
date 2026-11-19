# worker/artwork/ — folder index

## Purpose

Optional TMDB Anime artwork/sparse metadata enrichment; it must fail open and preserve catalogue identity.

## Direct files

- [service.test.ts](service.test.ts) — guide: service.test_readme.md.
- [service.ts](service.ts) — guide: service_readme.md.
- [tmdb.test.ts](tmdb.test.ts) — guide: tmdb.test_readme.md.
- [tmdb.ts](tmdb.ts) — guide: tmdb_readme.md.

## Child folders


## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.