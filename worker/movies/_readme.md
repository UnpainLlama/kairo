# worker/movies/ — folder index

## Purpose

Independent Movies domain module using Movie contracts and TMDB, separate from Anime.

## Direct files

- [repository.test.ts](repository.test.ts) — guide: repository.test_readme.md.
- [repository.ts](repository.ts) — guide: repository_readme.md.
- [service.test.ts](service.test.ts) — guide: service.test_readme.md.
- [service.ts](service.ts) — guide: service_readme.md.
- [types.ts](types.ts) — guide: types_readme.md.

## Child folders

- [providers/](providers/_readme.md)

## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.