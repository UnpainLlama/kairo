# worker/admin/ — folder index

## Purpose

Administrator-only Worker route/helper. Keep role and current Access identity checks server-side.

## Direct files

- [routes.test.ts](routes.test.ts) — guide: routes.test_readme.md.
- [routes.ts](routes.ts) — guide: routes_readme.md.

## Child folders


## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.