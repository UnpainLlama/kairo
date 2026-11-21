# Current implementation snapshot — 2026-11-21

> This status snapshot supersedes the older phase logs and gap lists below. The older sections are retained as historical notes and should not be read as the current repository state. It records verified implementation work but is not a claim that every one of the consolidated 51 audit findings has been closed; source-only CI cannot close the operational and provider-owner gates listed below.

## Current verified baseline

- GitHub Actions CI runs TypeScript typecheck, Vitest, production dependency audit and build.
- The fix/audit-findings branch is being used to remediate the consolidated 51-finding audit. The current PR is kept separate from main.
- Kairo interactive identity is Cloudflare Access only. Internal sessions are bound to the verified Access email and JWT subject. Expired/revoked Kairo sessions require an explicit Access logout/login rather than silent renewal.
- First-admin provisioning is separated from guest mode. The unmounted legacy Google sign-in implementation is removed; Google OAuth remains solely for the separate optional YouTube authorization.
- Account-scoped Anime library CRUD is implemented; Movies and Anime libraries are both reflected in the profile count.
- All account sign-out entry points (app shell, profile and admin console) use one tested sequence: revoke the server-side Kairo session, clear only that account's namespaced browser cache, then leave Cloudflare Access. Failed revocation neither clears local data nor redirects; guest data and server records are preserved.
- YouTube's recent-session step-up flow revokes the existing Kairo session before Cloudflare Access reauthentication, so the next `/api/v1/me` must establish a fresh internal session.
- Access JWT validation requires a non-empty, bounded `sub` claim; it no longer falls back to email as a substitute stable subject.
- Route metadata is centralised and covered for admin, YouTube history/watch-later, media detail/watch and unknown routes. The admin console path is not rotated before its 30-minute lease expires.
- The YouTube workspace exposes tested switches back to Anime and Movies on rail/mobile navigation. HLS.js is bundled with the app rather than loaded through global Video.js CDN scripts.
- Cloudflare Static Assets has an `ASSETS` binding for selective Worker-first asset requests. Real assets pass through; missing file-like paths that receive the SPA HTML fallback become 404s, while `/index.html` and ordinary SPA routes remain distinct.
- Account-specific Anime library, Movies library and Favorites views are implemented; the older UI-audit placeholder note is superseded.
- Administrator seat reassignment tombstones the former Access identity, creates a new profile ID, clears prior account-owned media/session/OAuth data, and frees the deleted seat without allowing an old Access token to auto-provision the former account again.
- The Pause history control is an account-wide D1 preference shared across Anime and Movies, with local-only behavior for guests and fail-closed behavior when the account preference cannot be verified.
- The Watch history page combines legacy Anime episode history with account-backed Movies playback snapshots. It supports per-title Movies deletion and a cross-media Clear action, while keeping YouTube history admin-only.
- Expired sessions, rate-limit buckets and consumed/expired OAuth transactions are cleaned by the scheduled Worker. Historical session IP and user-agent fields are cleared by migration 0019; new Kairo sessions no longer populate those fields.
- YouTube token encryption uses AES-GCM with account/purpose-bound AAD for new ciphertext and a read-only v1 compatibility path for previously stored rows.
- Catalogue, Movies search/discovery and episode-source reads use a hashed D1 rate limiter.
- HiAnime redirects are followed manually with HTTPS/host validation on every hop.
- Deployment workflow is non-cancellable during migration, installs with npm ci, pins Actions by SHA, builds before migrations, saves a pre-migration D1 export, and now requires successful remote /api/health and /api/ready probes before deploy proceeds.
- Production Wrangler values remain fail-closed placeholders until the owner configures the actual production D1, KV, Cloudflare Access and OAuth values.

## Remaining release gates (cannot be proven by source-only CI)

1. Configure exact Cloudflare Access destination overrides for /api/health and /api/ready in the deployment environment, then set KAIRO_REMOTE_HEALTH_CHECKS_ENABLED=true. Deploy now blocks when this variable is missing or either probe fails.
2. Verify ACCESS_ENFORCED, bootstrap state and migrations 0015–0020 against each real D1 database; source code does not prove those migrations have been applied remotely.
3. Supply real production APP_BASE_URL, GOOGLE_CLIENT_ID, Access team domain/AUD, D1 ID, KV ID and Worker secrets using Cloudflare/GitHub environment configuration. Never replace these with guessed values or commit secrets.
4. Confirm ownership, authorization and provider terms for every enabled Anime, HiAnime and embed/playback domain. Keep unverified domains removed and ZokoAnime disabled until approved.
5. Review the third-party HiAnime/mirror integration and TMDB/CineSrc terms with the relevant provider/legal owners before production release.
6. Inspect real browser CSP reports and test playback, modal navigation, scroll restoration, focus and screen-reader flows on desktop and mobile before enforcing CSP.
7. Confirm the real account cap against production records (including suspended/deleted/legacy profiles), and verify Access JWT expiry/revocation behaviour in the live Access application.
8. Run authenticated staging end-to-end checks against real Cloudflare Access, D1, KV, Google OAuth and provider APIs. Unit tests use fixtures and are not a substitute for live provider/integration tests.

No production deployment, remote database migration or live-provider/legal approval is implied by the code changes above.

---
# Implementation status

Working log for the master build prompt. Update after each session.

## Session log: Phase 1, Cloudflare infrastructure (2026-11-07)

**Checked against live `main` (7cc66ed):** the frontend PR (#3) and demo-data removal are merged. The housekeeping PR was NOT merged (Vitest still 3.2.4, no `vitest.config.ts`, no lockfile, Actions still `@v4`, CI on `main` only). CI results could not be read (GitHub's API rate-limited the sandbox).

**Built:** per-environment `wrangler.jsonc` (local, staging, production); env-aware npm scripts; one deploy job with staging as default and production double-gated; `/api/ready` now also proves the schema is migrated and reports cache/providers; docs/DEPLOYMENT.md with click paths. Superseded notes added to README, CLOUDFLARE_SETUP and GITHUB_SETUP.

**Verified in sandbox:** staging build config, Wrangler dry-run, migrations 0001+0002 via Wrangler on local D1 (idempotent), built Worker in workerd serving health/ready/API/SPA, typecheck, 73 tests, build.

**Not verified:** any real Cloudflare call. Owner must create D1, KV, token and GitHub environment secrets (docs/DEPLOYMENT.md section 2). Production deploy remains blocked.

---

## Session log: provider architecture (2026-11-06)

**Built and verified in a sandbox (typecheck, 72 tests, build, 0 audit findings; not yet run on GitHub CI):**
- Multi-provider metadata architecture: adapters (AniList, Kitsu, anime-offline-database mapper), normalisation, duplicate detection, cross-provider ID map, priority-based merging with provenance and conflict records, fallback, circuit breaker, caching (KV / edge / memory), error mapping. See docs/PROVIDERS.md.
- Migration `0002_provider_architecture.sql` (additive; applied twice against SQLite to prove it is re-runnable). New routes `GET /api/v1/providers` and `GET /api/v1/anime/:id/metadata`; no existing route changed.
- `worker/metadata/route.test.ts` runs the real route against real SQLite with only the provider's HTTP faked. It found and fixed two bugs during development (a hung provider could hang a request; stored `airing` status was dropped).
- Title page uses the unified record and lists its sources.

**Assumed / not verified:** adapters were tested against hand-written fixtures, not live responses; Kitsu's terms and limits were not read, so Kitsu is off; AniList's 90/min figure is from its docs, with one page warning of a 30/min degraded mode; the KV cache is not yet created.

**Not built:** dataset import job; Kitsu episodes; authentication; filter-only browse endpoint.

---

## Session log: frontend and housekeeping (2026-11-06)

**Verified (run in a sandbox with `npm install`, typecheck, `npm test`, `npm run build`; not yet confirmed by GitHub CI):**
- Frontend rebuilt against the existing API without changing any Worker route: Home, Search, Browse (trending, latest), Title page (details, episodes, similar titles by shared genre), account placeholders, 404. No demo data. `src/data/catalog.ts` removed.
- Tests: 33 passing (28 Worker tests + 5 search-URL tests).
- Vitest upgraded 3.x to 5.1; `npm audit` went from 3 findings (1 moderate, 2 critical, all Vitest-related dev dependencies) to 0. Vitest 5 needs its own `vitest.config.ts` because it cannot share `vite.config.ts` with the Cloudflare plugin.
- CI now also runs on pushes to `testing`; `actions/checkout` and `actions/setup-node` bumped to v6 (Node 24 runtime).

**Assumed / not checked:**
- Nothing has been viewed in a browser or run against a populated database.
- The scale of `rating` is unknown; the UI shows the bare number.
- `package-lock.json` still needs the *Generate package-lock.json* workflow.

**Still open:** Anime/Movies/Seasonal browse needs a filter-only endpoint; no auth or `/me` routes; no data source or import; legacy `styles.css` still has text under 12px; no UI or route tests; D1 database ID and deploy secrets not set.

---

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
13. Deployment is gated: see docs/DEPLOYMENT.md (staging first; production blocked until the owner approves).

## Suggested next order

1. Frontend routes + API-backed pages (search, detail, browse) with loading/empty/error states.
2. Identity-provider decision, then `/me/*` routes with ownership checks and library CRUD.
3. Player + progress sync behind the playback boundary.
4. Lint, accessibility pass, then deployment configuration.
