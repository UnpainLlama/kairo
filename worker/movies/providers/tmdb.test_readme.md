# worker/movies/providers/tmdb.test.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Independent Movies domain module using Movie contracts and TMDB, separate from Anime.

## Test scope

TMDB movie API mapping/auth/query/error behavior.

Vitest discovers src/**/*.test.ts and worker/**/*.test.ts from vitest.config.ts. Fixture-based tests do not prove live upstream availability or terms.

## Connections

Target area: worker/movies/providers/tmdb.ts. Update assertions when its public contract changes.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.