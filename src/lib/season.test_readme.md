# src/lib/season.test.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Frontend shared contract, API, state or persistence helper. Preserve typed boundaries with the Worker and guest/account isolation.

## Test scope

UTC season boundaries and year rollover.

Vitest discovers src/**/*.test.ts and worker/**/*.test.ts from vitest.config.ts. Fixture-based tests do not prove live upstream availability or terms.

## Connections

Target area: src/lib/season.ts. Update assertions when its public contract changes.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.