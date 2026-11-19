# worker/repositories/catalog.test.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

D1 query/repository helper; keep dynamic SQL parameterized and media domains separate.

## Test scope

Parameterized Anime SQL filter/search/order/pagination/genre/related builders.

Vitest discovers src/**/*.test.ts and worker/**/*.test.ts from vitest.config.ts. Fixture-based tests do not prove live upstream availability or terms.

## Connections

Target area: worker/repositories/catalog.ts. Update assertions when its public contract changes.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.