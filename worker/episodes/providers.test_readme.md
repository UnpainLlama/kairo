# worker/episodes/providers.test.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Independent Anime episode discovery/provider/parser module. Episode metadata is not itself a playable stream.

## Test scope

HiAnime parsing/server records, approved URL handling and Jikan episode list mapping.

Vitest discovers src/**/*.test.ts and worker/**/*.test.ts from vitest.config.ts. Fixture-based tests do not prove live upstream availability or terms.

## Connections

Target area: worker/episodes/providers.ts. Update assertions when its public contract changes.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.