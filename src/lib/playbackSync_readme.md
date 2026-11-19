# src/lib/playbackSync.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Pure playback checkpoint policy; server periodic sync interval is 60 seconds plus immediate event-driven flushes.

## Public surface / contents

Inspect source for exact exports, components, types, routes or configuration keys; filename alone is not a contract.

## Related tests

A same-basename test file exists at src/lib/playbackSync.test.ts. Run npm test after changing this module.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.