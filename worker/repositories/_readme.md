# worker/repositories/ — folder index

## Purpose

D1 query/repository helper; keep dynamic SQL parameterized and media domains separate.

## Direct files

- [catalog.test.ts](catalog.test.ts) — guide: catalog.test_readme.md.
- [catalog.ts](catalog.ts) — guide: catalog_readme.md.
- [providerIds.ts](providerIds.ts) — guide: providerIds_readme.md.

## Child folders


## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.