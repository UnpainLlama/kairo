# worker/hianime/ — folder index

## Purpose

Shared HiAnime client/parser. Respect the fixed HTTPS mirror allowlist and provider restrictions.

## Direct files

- [client.ts](client.ts) — guide: client_readme.md.
- [parser.ts](parser.ts) — guide: parser_readme.md.

## Child folders


## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.