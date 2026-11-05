# Implementation status

Working log for the master build prompt. Update after each session.

## Verified

- **CI toolchain:** typecheck, tests and build pass on GitHub Actions (reported green on branch `fix/playback-timeout-typecheck`). The only fix needed was one line in `worker/providers/playback.ts` (`if (timer !== undefined) clearTimeout(timer)`).
- `worker/lib/validation.ts` (14 tests) and `worker/providers/playback.ts` (7 tests): authorized-playback boundary and request validation.
- `worker/repositories/catalog.ts` (7 tests): parameterized search with filters/sort, trending, latest, genres, related. The queries were also executed against `migrations/0001_initial_schema.sql` on real SQLite with edge-case data (LIKE wildcards, injection text, NULL ratings, malformed genre JSON).

## Written but not yet confirmed by CI

- `worker/index.ts` now uses the validation and query modules and adds `/api/ready`, trending, latest, genres, related, and filtered/sorted search. It was only checked against stand-in Hono/D1 types; the first CI run on it is the real check.

## Repo audit (full repo vs. spec documents)

Compared the uploaded `main` and `fix/playback-timeout-typecheck` zips against `docs/*` and the master prompt.

- `main` and the fix branch differ only by the one-line `clearTimeout` fix. Both already carry the `@cloudflare/workers-types` pin change (`^4.20261104.0` → `^5.20261016.1`); keep it.
- `.gitignore` and `.env.example` are **missing from the repo** (the GitHub web uploader skips dotfiles). Add them via *Add file → Create new file*.
- Design tokens match the spec: all nine Astral Plum hex values, four themes, strong measured contrast (text ≥ 15:1, muted ≥ 8:1 on bg/surface).
- Existing Worker SQL (7 statements) prepares cleanly against `0001_initial_schema.sql`; schema has FKs, CHECKs, ownership columns and 9 indexes.
- `wrangler.jsonc` lacked `assets.run_worker_first`, so opening `/api/...` in a browser tab would return the SPA's `index.html` instead of the Worker. Fixed here with `"run_worker_first": ["/api/*"]`.

## Done so far (roadmap)

Foundation (repo, CI), validation, playback boundary, read-only catalogue API (health, ready, featured, trending, latest, search, genres, details, episodes, related).

## Remaining gaps

**Frontend**
1. `App.tsx` renders the home page for every URL. Routes in `PRODUCT_SPEC.md` (`/search`, `/browse/:category`, `/anime/:slug`, `/watch/:episodeId`, `/library`, `/profile`, `/settings`) do not exist.
2. Inert controls: "View all", hero pagination dots, footer links, profile buttons; the `⌘ K` hint has no handler.
3. Demo content can pass as live: "Continue your journey" is `catalog.slice(1, 5)`, and in live mode demo items are still appended to API results under a "Connected catalogue" label. Continue Watching must be signed-in progress only.
4. Search is a client-side filter over 8 demo items, not `/api/v1/catalog/search`.
5. Saved titles live in `localStorage`; the spec requires an account-scoped library.
6. Type scale: 41 of 48 fixed `font-size` declarations are under 12px (smallest 6px). Colour contrast is fine; size is not. No skeletons, toasts, dialogs, live regions, skip link, or combobox semantics; 1 keyboard handler.
7. Search panel and theme switcher lack dialog/combobox/menu semantics.

**Worker / data**
8. Not implemented: all `/me/*` routes (two stubs return 401), real playback resolution, auth middleware, identity-provider choice.
9. No ingestion: the catalogue has no data until an authorized metadata provider is connected or data is imported.
10. Schema has no provider-relation or genre tables; preferences lack subtitle styling and privacy fields. Add via new migrations only.
11. Security headers (nosniff, frame, referrer) are set on `/api/*` only; no CSP, HSTS or Permissions-Policy; static assets get none (use `public/_headers`). No rate limiting exists (only a `429` status type); use a Cloudflare rate-limiting rule or binding before launch.

**Tooling**
12. Only 21 unit tests (validation, playback, SQL builders); no API-route, auth, library, progress or UI tests. No lint script; `hls.js` not a dependency; no `package-lock.json` yet (run the *Generate package-lock.json* workflow, then CI uses `npm ci`).
13. Deployment is gated: needs `DEPLOY_ENABLED=true`, Cloudflare secrets, and a real D1 database ID in `wrangler.jsonc`.

## Suggested next order

1. Frontend routes + API-backed pages (search, detail, browse) with loading/empty/error states.
2. Identity-provider decision, then `/me/*` routes with ownership checks and library CRUD.
3. Player + progress sync behind the playback boundary.
4. Lint, accessibility pass, then deployment configuration.
