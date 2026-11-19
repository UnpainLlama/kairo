# src/lib/AccountProvider.tsx

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Global identity/session context from /api/v1/me. Distinguishes loading/guest/signed-in/denied/unavailable and flushes pending playback sync when account changes.

## Public surface / contents

Inspect source for exact exports, components, types, routes or configuration keys; filename alone is not a contract.

## Related tests

No one-to-one same-basename test is asserted here; search the parent domain's test files for broader service/route coverage.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.