# Current implementation snapshot — 2026-11-24

> Status for `rebuild/username-password-auth`. This snapshot separates verified repository/CI work from browser and remote-environment checks.

## Branch and operational boundary

- Feature branch: `rebuild/username-password-auth`.
- Latest branch head: [`aea15a1ee649db3b6b377b06ac49dadd4ac09111`](https://github.com/UnpainLlama/kairo/commit/aea15a1ee649db3b6b377b06ac49dadd4ac09111).
- GitHub Actions run [45406346412](https://github.com/UnpainLlama/kairo/actions/runs/45406346412) passed typecheck, **324 tests across 43 files**, dependency audits and production build on that exact head. Cloudflare deployment was skipped as expected for this feature branch.
- The feature branch records current `main` ([`e29a4b1bcec54ffec27c2aed80c683cd670860b8`](https://github.com/UnpainLlama/kairo/commit/e29a4b1bcec54ffec27c2aed80c683cd670860b8)) as a parent. The seven Miruro UI changes from `main` were adapted into the rebuilt `KairoApp` structure rather than copying the old application shell.
- This does **not** merge the feature branch into `main`. No PR has been opened as part of this work.
- No Cloudflare configuration, Worker secret, Access policy, remote D1 migration/query, deployment, or real administrator credential operation has been performed.

## Automated verification — passed

- TypeScript project typecheck: passed.
- Vitest: **324 tests passed across 43 test files**.
- Production dependency audit and full dependency audit: zero reported vulnerabilities.
- Worker and client production build: passed under Node 22.23.5 / npm 10.9.9.
- Wrangler Access configuration validation in the CI job: passed.
- Cloudflare deployment job: skipped for this feature branch.
- The build still reports a Vite client-bundle advisory: the entry bundle is approximately **953.70 kB** (293.45 kB gzip), above the 500 kB warning threshold. The YouTube route is lazy-loaded as a separate chunk; further route-level splitting may still be worthwhile.
- There is no lint script in `package.json`; lint is not marked complete.
- Additive migration review: 0023 creates `user_credentials` with a cascading profile foreign key; 0024 adds a constrained subtitle-size preference; 0025 stores only Anime provider IDs and slugs, not catalogue metadata. The test database migration list includes all three migrations.
- Account-cap review: migration 0021's database triggers continue to cap active/suspended standard accounts at 15; the admin route maps the trigger to HTTP 409 and a test verifies the 16th account is rejected.
- Password-hash decision remains open: the Worker currently uses PBKDF2-HMAC-SHA256 v2 with 100,000 iterations. Current OWASP guidance recommends 600,000 for PBKDF2-HMAC-SHA256. Cloudflare documents 10 ms CPU per HTTP request on Workers Free and a 30-second default on Workers Paid; `wrangler.jsonc` does not set `limits.cpu_ms`. No Workerd/staging benchmark or account-plan verification was performed because environment checks were skipped at the owner's request. Do not increase the work factor blindly; select the target plan, measure valid/invalid login CPU and latency, then make an explicit security/performance decision.

## Phase 2 — Catalogue and Anime workspace

- Existing catalogue adapters and Worker routes remain for featured, trending, latest, search, filter browse, genres, title details, episodes, related titles and provider attribution.
- The Anime home page includes a featured-title carousel, Trending/Popular/Top ranking tabs, Top Airing and Upcoming side panels, Latest updates and the shared Continue watching rail.
- Featured carousel supports timed rotation, previous/next controls, keyboard and touch navigation, hidden-tab pause and reduced-motion behavior.
- Miruro-inspired Anime navigation and styling are scoped to Anime routes; Movies and account pages retain their own interface.
- MAL is the sole live Anime metadata provider when MAL_CLIENT_ID is configured; a missing secret leaves the active catalogue provider list empty and live catalogue routes fail closed. Retired provider adapters and live calls have been removed.
- TMDB supplies poster/backdrop URLs and optional episode stills only. MAL remains authoritative for synopsis, score, genres, season, year, format, status and episode count.
- Jikan and HiAnime remain separate episode-discovery providers. New Anime catalogue IDs use MAL-native m... references; historical library identifiers are retained as stored references without an upstream lookup.
- Miruro-inspired Anime navigation and home composition include the icon rail, Continue Watching carousel and Top Airing sidebar. The desktop OS dock in the uploaded recording is not part of the app and is not copied.
- MAL and TMDB fixtures are automated; live credentials and upstream response validation remain to be completed in a target Worker environment.

## Phase 3 — Identity, profile, shared account and workspaces

- Username/password login, opaque sessions, forced first-login password change, logout and account-administration APIs remain implemented. The public first-admin setup page/component, `/api/v1/admin/bootstrap` endpoint, bootstrap token binding and public middleware exception have been removed. A regression test verifies the removed endpoint is covered by the normal authentication gate. The offline existing-admin recovery utility now only changes the existing active admin's username/credential and revokes its sessions; it no longer writes the legacy bootstrap-completion marker. The legacy schema row remains for readiness compatibility.
- Frontend screens include profile, Anime/Movies library, watch history, account preferences and restricted administrator management.
- Worker routes cover profile read/update, opt-in public profiles, account preferences, JSON data export and password-confirmed standard-account deletion.
- Account deletion retains a minimal tombstone, removes account-owned rows (including provider-backed Anime references) and revokes sessions. Administrator self-deletion remains blocked.
- The YouTube workspace is restored under `/youtube/*` and is accessible from the main navigation only to administrator accounts. It has separate Home/feed, Search, Channels, Watch, Watch Later and History screens; the workspace is lazy-loaded and visually scoped away from Anime/Movies.
- YouTube continues to use the existing administrator-only Worker namespaces. Regression tests verify that a standard signed-in account receives 404 for both `/api/v1/youtube/history` and `/api/v1/auth/youtube/status`, while an administrator session can access both.
- YouTube subscriptions, Watch Later and history remain scoped to the same administrator Kairo user ID. No separate user identity or account system was added.

## Phase 4 — Player and shared progress

- Existing server-side Anime playback resolution and host allowlists remain in place.
- Native HLS/file playback restores cloud/local resume positions, applies default speed and subtitle preferences, exposes HLS quality only when manifest levels are returned, exposes subtitle selection only when tracks are supplied, and provides source retry.
- Movies remain behind the CineSrc embed boundary and unified account progress API.
- The YouTube watch page uses the YouTube iframe player API; videos marked non-embeddable offer an external YouTube link instead.
- YouTube playback snapshots use the shared `/api/v1/me/playback` boundary and local/cloud playback helpers with media type `youtube`. Removing a YouTube history item also deletes its matching shared playback snapshot.
- YouTube Made for Kids videos are not persisted as viewing activity by this interface.
- Limitation: an external cross-origin embed without a documented seek API cannot be programmatically resume-restored.
- Browser/player, YouTube API quota/configuration and OAuth connectivity checks are intentionally skipped for this pass at the owner's request and remain unverified.

## Phase 5 — Quality and manual validation

- Focused route tests cover profile privacy, preferences, account export/deletion, provider-backed Anime save/list/remove, malformed provider IDs, legacy D1 slug compatibility, tombstone cleanup and administrator-only YouTube route access.
- Full CI passes on the latest feature head: typecheck, 324 tests across 43 test files, dependency audits and production build.
- Browser-based accessibility/keyboard testing, visual review, mobile-browser layout checks and staging/production runtime smoke tests were skipped at the owner's request. They are not claimed as passed.

## Remaining before merge

1. Browser/mobile checks and live provider/OAuth checks have been skipped at the owner's request. They remain unverified, not passed.
2. Resolve the PBKDF2 work-factor decision against the intended Workers plan and a real Workerd/staging CPU/latency measurement. The current 100,000-iteration cost is below OWASP's 600,000 PBKDF2-HMAC-SHA256 recommendation; no change has been made without the requested performance evidence.
3. Apply neither migration 0024 nor 0025 remotely until the owner separately approves the schema/data review and deployment step.
4. The feature branch has been reconciled with `main` history. Current comparison: 60 commits ahead, 0 behind; merge base `e29a4b1bcec54ffec27c2aed80c683cd670860b8`.
5. No merge to `main`, PR creation or deployment has been performed.

## Release and environment boundary

The passed CI build proves the repository's Worker/client build in the GitHub Actions runner. It does not prove that current Cloudflare staging/production secrets, D1 databases, Access policies or remote migrations are provisioned correctly. Keep remote D1 operations, Cloudflare Access changes, secret changes, session resets, administrator credential changes and deployment as separately approved steps.

# Historical implementation status

The older session logs below are retained as history. Their Access-only identity descriptions and old route claims are superseded by the current branch status above.
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
- Legacy D1 metadata architecture: adapters (Kitsu, anime-offline-database mapper), normalisation, duplicate detection, cross-provider ID map, priority-based merging with provenance and conflict records, fallback, circuit breaker, caching (KV / edge / memory), error mapping. See docs/PROVIDERS.md.
- Migration `0002_provider_architecture.sql` (additive; applied twice against SQLite to prove it is re-runnable). New routes `GET /api/v1/providers` and `GET /api/v1/anime/:id/metadata`; no existing route changed.
- `worker/metadata/route.test.ts` runs the real route against real SQLite with only the provider's HTTP faked. It found and fixed two bugs during development (a hung provider could hang a request; stored `airing` status was dropped).
- Title page uses the unified record and lists its sources.

**Assumed / not verified:** adapters were tested against hand-written fixtures, not live responses; Kitsu's terms and limits were not read, so Kitsu is off; MAL's published request limit was not verified; the per-isolate pacer is a best-effort guard, not a global rate limit.

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
