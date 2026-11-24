# Current implementation snapshot — 2026-11-24

> Branch-specific snapshot for `rebuild/username-password-auth`. This documents code present in the feature branch and distinguishes source changes from checks that have not been run.

## Branch and operational boundary

- Feature branch: `rebuild/username-password-auth`.
- Latest grouped implementation commit: [`b182bf6ea1ab361aed13ac8a1630e1a53aaddb82`](https://github.com/UnpainLlama/kairo/commit/b182bf6ea1ab361aed13ac8a1630e1a53aaddb82).
- The branch is based on reset commit `4f77801029da116c79909b69f84433ecd3b67d18` and has diverged from `main`; re-check the comparison immediately before any merge/reconciliation.
- No PR has been opened and `main` has not been changed.
- No deployment, Cloudflare edge/configuration change, Worker secret change, remote D1 migration/query, session wipe or real administrator credential operation has been performed.

## Phase 2 — Catalogue

- Existing catalogue provider adapters and Worker routes remain in place: featured, trending, latest, search, filter browse, genres, title details, episodes, related titles and provider attribution.
- Restored frontend pages: Discover, Anime browsing and filtering, seasonal filter, search, Anime detail, episode selection and related titles.
- Movie discover/search/detail screens use existing TMDB routes and preserve the provider enablement/terms gate.
- Provider results and errors are surfaced as loading, empty or unavailable states; no demo titles are injected.
- Remaining: catalogue ingestion is not implemented in this client rebuild; a provider/terms-approved ingestion path and a populated D1 library must be verified separately. Live provider Anime IDs must be reconciled with account-library persistence before claiming saved Anime works for every provider result.

## Phase 3 — Identity, profile and library

- Username/password session login, first-login password change, logout and administrator account APIs remain implemented.
- Frontend routes now include profile, account preferences, Anime library, Movies library, watch history and restricted account administration.
- Worker routes now provide profile read/update, opt-in public-profile read, preferences (theme, subtitle language/size, autoplay, speed and history pause), JSON account export and password-confirmed standard-account deletion.
- A shared account-deletion helper retains a minimal tombstone and removes account-owned rows; administrator self-deletion remains blocked.
- Account routes are session-scoped; public profile responses are explicitly allowlisted and do not return email, account IDs, libraries or history.
- Existing accounts without password credentials can be enrolled from the administrator UI; generated temporary passwords are displayed once in the current admin session.
- Additive migration `0024_account_preference_subtitle_size.sql` adds subtitle scale. Test DB migration list includes 0024. This migration has **not** been applied to any remote database.

## Phase 4 — Player and progress

- Existing server-side playback resolution still enforces the provider host allowlist; unsupported/unapproved sources remain unavailable rather than bypassed.
- Anime HLS/file player now restores cloud and local resume positions, saves player settings, exposes quality choices only when Hls.js receives manifest levels, exposes subtitles only when supplied by the selected source, and offers a retry for source failures.
- Account playback snapshots retain duration and player state; client-local snapshots update between throttled cloud syncs.
- Movie playback continues through the CineSrc iframe boundary; its progress integration uses the unified account playback API.
- Account-wide history pause is enforced server-side for Anime/Movie playback and legacy Anime watch-history updates; administrator-only YouTube sync remains separate.
- Limitation: external Anime embeds that do not expose a documented time-control API cannot be programmatically seek-restored. Kairo does not inject controls into cross-origin frames.

## Phase 5 — Quality

- Focused profile and preference route tests have been added/expanded, including opt-in public visibility, same-origin checks, data export, account tombstoning and validated preference persistence.
- Existing auth, admin, playback, provider, API and catalogue test suites remain in the repository.
- UI includes loading/error/empty states, skip-to-content, keyboard search shortcut, reduced-motion rules and responsive layouts.
- **Not verified on this branch head:** TypeScript typecheck, Vitest, production dependency audit, accessibility/keyboard pass, mobile-browser pass and production build.
- There is no lint script in `package.json`; do not mark lint complete.
- Feature-branch pushes do not trigger the repository's current CI workflow. No Actions result is being represented as passing.

## Remaining work before merge consideration

1. Reconcile the live Anime provider-ID / account-library relationship so titles returned from live catalogue providers can always be saved and restored reliably without trusting client-supplied title metadata.
2. Audit all UI/backend payload types and complete the remaining integration tests (especially playback sync ordering, pause-history behavior, admin enrollment/deletion and Movie list operations).
3. Run typecheck, tests, audit and production build on the exact feature head in a controlled local/CI environment; fix all failures.
4. Perform the accessibility, keyboard, provider failure, responsive and account-ownership regression passes.
5. Re-check branch divergence against current `main` and prepare a separate reconciliation. Do not merge or deploy as part of this coding pass.

## Release and operational blockers

- Review and approve migration 0024 before any remote D1 application.
- Review the current PBKDF2 work factor (100,000 iterations) against measured Cloudflare Worker CPU constraints and the current OWASP guidance before production use.
- Keep Cloudflare Access as the separately configured outer perimeter until a separate, approved edge-policy decision.
- Do not deploy, alter edge policies, run remote D1 operations, wipe sessions or create real admin credentials during the feature rebuild.
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
