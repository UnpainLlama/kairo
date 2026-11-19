# worker/auth/ — folder index

## Purpose

Worker identity/session/authorization module. Access is Kairo sign-in; account ownership and role must be checked server-side.

## Direct files

- [closedAccessMigrations.test.ts](closedAccessMigrations.test.ts) — guide: closedAccessMigrations.test_readme.md.
- [cloudflareAccess.test.ts](cloudflareAccess.test.ts) — guide: cloudflareAccess.test_readme.md.
- [cloudflareAccess.ts](cloudflareAccess.ts) — guide: cloudflareAccess_readme.md.
- [google.ts](google.ts) — guide: google_readme.md.
- [oauth.test.ts](oauth.test.ts) — guide: oauth.test_readme.md.
- [password.test.ts](password.test.ts) — guide: password.test_readme.md.
- [password.ts](password.ts) — guide: password_readme.md.
- [routes.test.ts](routes.test.ts) — guide: routes.test_readme.md.
- [routes.ts](routes.ts) — guide: routes_readme.md.
- [session.test.ts](session.test.ts) — guide: session.test_readme.md.
- [session.ts](session.ts) — guide: session_readme.md.
- [youtube.ts](youtube.ts) — guide: youtube_readme.md.

## Child folders


## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.