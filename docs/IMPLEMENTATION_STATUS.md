# Current implementation snapshot — 2026-11-24

> Status for `rebuild/username-password-auth`. Automated verification is recorded separately from manual browser and remote-environment validation.

## Branch and operational boundary

- Feature branch: `rebuild/username-password-auth`.
- Automated verification passed on [`dd218478cbbabd3dcd8ae324ce1643d432d1410b`](https://github.com/UnpainLlama/kairo/commit/dd218478cbbabd3dcd8ae324ce1643d432d1410b), GitHub Actions run [45394157805](https://github.com/UnpainLlama/kairo/actions/runs/45394157805).
- The verification workflow now runs on pushes to this feature branch. Its Cloudflare deploy job remains restricted to main pushes or explicit manual dispatch; it was skipped for this run.
- The feature branch has not been merged, no PR has been opened, and `main` has not been modified by this implementation pass.
- Current history review: the branches share base `08b15184a659a7346d4659ffb214a5a62dbd7b15`; `main` has 7 commits after that base (the Miruro UI integration), while this feature branch has 45. Current `main` head at review was `e29a4b1bcec54ffec27c2aed80c683cd670860b8`.
- No Cloudflare configuration, Worker secret, Access policy, remote D1 migration/query, deployment or real administrator credential operation has been performed.

## Automated verification — passed

- TypeScript project typecheck: passed.
- Vitest: **322 tests passed across 43 test files**.
- Production dependency audit (`npm audit --omit=dev`): zero reported vulnerabilities.
- Full dependency audit: zero reported vulnerabilities.
- Worker and client production build: passed under Node 22.23.5 / npm 10.9.9.
- Wrangler Access configuration validation in the verification job: passed.
- Build note: Vite reports the main client JavaScript chunk at approximately 943 kB (290 kB gzip), above its 500 kB advisory threshold. It does not fail the build; route/player code splitting can be considered as a follow-up performance improvement.
- There is no lint script in `package.json`; lint is not marked complete.

## Phase 2 — Catalogue

- Existing catalogue adapters and Worker routes remain for featured, trending, latest, search, filter browse, genres, title details, episodes, related titles and provider attribution.
- Frontend catalogue screens cover Discover, Anime browse/seasonal browse, search, Anime details and episode selection.
- Movies discovery, search and detail pages use existing TMDB endpoints and preserve the metadata-provider enablement/terms gate.
- Provider-backed Anime library references support AniList, MAL and HiAnime alongside legacy D1-backed rows. The client resolves display metadata through the configured title API; browser-supplied title, poster and synopsis metadata is not written to the catalogue.
- Library metadata resolution is incremental: 24 saved provider references are displayed per batch, with at most eight concurrent title lookups.
- Remaining: verify configured Anime catalogue/episode provider combinations against live responses. The automated provider tests use controlled fixtures; this change does not add provider-wide catalogue ingestion.

## Phase 3 — Identity, profile and library

- Username/password login, opaque sessions, forced first-login password change, logout, administrator bootstrap and account administration APIs remain implemented.
- Frontend screens include profile, Anime/Movies library, watch history, account preferences and restricted administrator management.
- Worker routes cover profile read/update, opt-in public profiles, account preferences, JSON data export and password-confirmed standard-account deletion.
- Account deletion retains a minimal tombstone, removes account-owned rows (including provider-backed Anime references) and revokes sessions. Administrator self-deletion remains blocked.
- Existing profiles without new credentials can be enrolled from the admin console with a one-time temporary password.
- Additive migration 0024 adds subtitle size; additive migration 0025 adds provider-backed Anime library references. Both are included in the test migration harness. Neither has been applied remotely.

## Phase 4 — Player and progress

- Existing server-side playback resolution and host allowlists remain in place.
- Native HLS/file playback restores cloud/local resume positions, applies default speed and subtitle preferences, exposes HLS quality only when manifest levels are returned, exposes subtitle selection only when tracks are supplied, and provides source retry.
- Playback snapshots retain duration and player state; local progress is retained between throttled cloud sync attempts.
- Movies remain behind the CineSrc embed boundary and unified account progress API.
- History pause is enforced server-side for new Anime/Movie account progress; administrator-only YouTube progress remains separate.
- Limitation: an external cross-origin embed without a documented seek API cannot be programmatically resume-restored.

## Phase 5 — Quality and manual validation

- Focused route tests cover profile privacy, preferences, account export/deletion, provider-backed Anime save/list/remove, malformed provider IDs, legacy D1 slug compatibility and tombstone cleanup.
- The provider-library and metadata tests exercise Worker request routing with SQLite-backed D1 and authenticated test sessions.
- The UI has loading/error/empty states, responsive styles, keyboard search handling, skip-to-content and reduced-motion rules.
- **Still not covered by the automated CI run:** browser-based accessibility/keyboard testing, mobile-browser layout checks, visual review, and staging/production runtime smoke tests.

## Remaining before merge

1. Perform the browser/manual regression pass for account enrolment/deletion, library ownership, public-profile privacy, playback resume/order, history pause, provider failures, keyboard interaction and mobile layout.
2. Verify the live AniList/MAL/HiAnime data and playback provider combinations; decide how saved titles should display when an upstream provider removes or renames a title.
3. Review additive migrations 0024/0025 and the PBKDF2 work factor against Cloudflare Worker CPU constraints before any remote application/deployment.
4. Reconcile the 7 main-only Miruro UI commits before merge. They update `src/App.tsx`, add `src/pages/HomePage.tsx`, change `src/styles.css` and add `docs/MIRURO_UI_INTEGRATION.md`; this rebuild has replaced the old `App`/home-page structure and has its own styles, so a blind merge risks losing the Anime workspace design. Port or deliberately resolve those changes on this feature branch, then re-run CI.
5. Re-check the merge base and file-level divergence against the live `main` immediately before preparing the merge. Keep reconciliation and merge as a separate reviewed step.

## Release and environment boundary

- The passed CI build proves the repository's Worker/client build in the GitHub Actions runner. It does not prove that the current Cloudflare staging/production secrets, D1 databases, Access policies or remote migrations are provisioned correctly.
- Review and approve migrations 0024 and 0025 before remote D1 application.
- Cloudflare Access remains a separately configured outer perimeter; any policy/validator change needs separate approval.
- Do not deploy, change edge policies, run remote D1 operations, wipe sessions or create real administrator credentials during this feature-branch implementation pass.

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
