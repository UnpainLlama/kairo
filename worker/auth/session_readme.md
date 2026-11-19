# worker/auth/session.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Internal opaque HttpOnly Kairo session create/read/revoke; binds session to Access email and account status.

## Public surface / contents

Inspect source for exact exports, components, types, routes or configuration keys; filename alone is not a contract.

## Related tests

A same-basename test file exists at worker/auth/session.test.ts. Run npm test after changing this module.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.