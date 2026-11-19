# worker/youtube/routes.test.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Administrator-only official YouTube Data API media route/validation module; no scraping or stream extraction.

## Test scope

YouTube media input validation, thumbnails, embedding and Made-for-Kids responses.

Vitest discovers src/**/*.test.ts and worker/**/*.test.ts from vitest.config.ts. Fixture-based tests do not prove live upstream availability or terms.

## Connections

Target area: worker/youtube/routes.ts. Update assertions when its public contract changes.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.