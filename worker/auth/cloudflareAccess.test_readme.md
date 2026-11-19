# worker/auth/cloudflareAccess.test.ts

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Worker identity/session/authorization module. Access is Kairo sign-in; account ownership and role must be checked server-side.

## Test scope

Access JWT verification, email identity, profile linking/provisioning and disabled-account checks.

Vitest discovers src/**/*.test.ts and worker/**/*.test.ts from vitest.config.ts. Fixture-based tests do not prove live upstream availability or terms.

## Connections

Target area: worker/auth/cloudflareAccess.ts. Update assertions when its public contract changes.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.