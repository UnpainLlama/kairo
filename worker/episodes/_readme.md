# worker/episodes/ — folder index

## Purpose

Independent Anime episode discovery/provider/parser module. Episode metadata is not itself a playable stream.

## Direct files

- [providers.test.ts](providers.test.ts) — guide: providers.test_readme.md.
- [service.test.ts](service.test.ts) — guide: service.test_readme.md.
- [service.ts](service.ts) — guide: service_readme.md.

## Child folders

- [parsers/](parsers/_readme.md)
- [providers/](providers/_readme.md)

## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.