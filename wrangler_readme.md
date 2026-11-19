# wrangler.jsonc

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Cloudflare Worker configuration: entry point, SPA assets, D1/KV bindings, environment vars, provider order and deploy flags. Production placeholders are intentionally fail-closed.

## Public surface / contents

Inspect source for exact exports, components, types, routes or configuration keys; filename alone is not a contract.

## Configuration notes

Local/staging Anime provider order is anilist,mal,hianime; episode discovery is configured independently. Production placeholders are fail-closed. See docs/DEPLOYMENT.md. Do not store secret values in vars.


## Maintenance

Read the parent folder's _readme.md and the repository handoff at docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.