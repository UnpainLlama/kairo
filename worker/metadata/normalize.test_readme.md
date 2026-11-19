# worker/metadata/normalize.test.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Provider-neutral Anime metadata normalization/cache/match/merge/enrichment or legacy D1 metadata implementation.

## Test scope

Metadata normalization and safe URL/status/format mapping.

Vitest discovers src/**/*.test.ts and worker/**/*.test.ts from vitest.config.ts. Fixture-based tests do not prove live upstream availability or terms.

## Connections

Target area: worker/metadata/normalize.ts. Update assertions when its public contract changes.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.