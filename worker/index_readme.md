# worker/index.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Cloudflare Worker/Hono composition root. Applies request IDs/security headers/origin protection/Access JWT and account checks; registers auth/admin/YouTube/Anime/Movies/account routes and scheduled console rotation.

## Public surface / contents

Inspect source for exact exports, components, types, routes or configuration keys; filename alone is not a contract.

## Security/route notes

Worker composition root. Request validation, same-origin mutation checks, Access identity and server-derived ownership are enforced here or in registered route modules.

## Related tests

No one-to-one same-basename test is asserted here; search the parent domain's test files for broader service/route coverage.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.