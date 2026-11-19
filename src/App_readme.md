# src/App.tsx

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Top-level React Router composition and global Kairo shell. Owns route registration, shared navigation/search chrome and the AdminOnly gate around all YouTube pages. Domain data access remains in pages and src/lib.

## Public surface / contents

Inspect source for exact exports, components, types, routes or configuration keys; filename alone is not a contract.

## Routing notes

Owns page routes and AdminOnly UI guard. All YouTube routes must remain admin-only in the Worker independently of frontend protection.

## Related tests

No one-to-one same-basename test is asserted here; search the parent domain's test files for broader service/route coverage.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.