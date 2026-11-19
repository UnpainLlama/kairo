# migrations/0008_youtube_feed_channels.sql

Companion guide for this tracked file. Source code and current tests are authoritative.

## Responsibility

Ordered additive D1 migration. Never edit after it has been applied to a shared environment.

## Database effect

User-owned Kairo curated YouTube channels (not actual subscriptions).

Apply migrations in numeric order. Never edit a migration already applied to a shared database; create a later migration. worker/auth/closedAccessMigrations.test.ts validates the full chain.

## Maintenance

Read the parent folder's _readme.md and the repository handoff at ../docs/REPO_HANDOFF.md. Update this guide and affected caller/test docs when responsibilities or connections change. Run typecheck, tests and build for code/config changes; run migration tests for SQL changes.