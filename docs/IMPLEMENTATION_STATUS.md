# Current implementation snapshot — 2026-11-24

> Status for `rebuild/username-password-auth`. This records implementation present in source separately from tests/builds and remote operations that have not been performed.

## Branch and operational boundary

- Work remains on `rebuild/username-password-auth`; `main` is untouched.
- The latest committed checkpoint before this provider-library batch is [`83715630e70510a9d3bdedcf2050552b8966aba0`](https://github.com/UnpainLlama/kairo/commit/83715630e70510a9d3bdedcf2050552b8966aba0). The provider-backed Anime library work is being committed as a separate batch.
- No pull request has been opened. No merge or deployment has occurred.
- No Cloudflare configuration, Worker secret, remote D1 database, Access policy, or live administrator credential has been changed.

## Phase 2 — Catalogue

- Catalogue provider adapters and Worker routes remain in place for featured, trending, latest, search, filtered browse, genres, title details, episodes, related titles and provider attribution.
- Frontend catalogue pages cover Discover, Anime browse, seasonal browse, search, title details and episodes.
- Movies discovery, search and detail pages use existing TMDB endpoints and preserve the metadata-provider terms/enablement gate.
- Account Anime library now supports both legacy D1 entries and provider-reference entries for AniList, MAL and HiAnime. Provider metadata is re-fetched from the configured title endpoint; client-supplied title, synopsis and poster data are not stored as catalogue truth.
- Remaining: verify all configured catalogue/episode provider combinations with live responses and confirm the relevant provider terms/limits. No provider-wide catalogue ingestion is introduced by this library work.

## Phase 3 — Identity, profile and library

- Username/password login, session validation, forced first-login password change, logout, administrator bootstrap and account administration endpoints remain implemented.
- The frontend contains profile, library, history, preferences/settings and restricted admin pages.
- Worker routes cover profile read/update, opt-in public profile, theme/playback/history preferences, account JSON export and password-confirmed standard-account deletion.
- Standard-account deletion retains a minimal tombstone, removes owned records and revokes sessions; administrator self-deletion remains blocked.
- Existing accounts without credentials can be enrolled by an administrator using a one-time temporary password.
- Additive migration 0024 adds subtitle size; additive migration 0025 adds account-scoped Anime provider references. The migration test harness includes both. Neither migration has been applied remotely.

## Phase 4 — Player and progress

- Existing playback resolution and host allowlists remain in place; unsupported sources are not bypassed.
- Native HLS/file playback supports cloud/local resume positions, default playback speed and subtitle preferences, source-provided subtitles, Hls.js quality selection when levels are supplied, and retry for fatal source failures.
- Progress snapshots retain duration and player state; local snapshots update between throttled cloud sync attempts.
- Movies continue through the CineSrc embed boundary and unified account progress API.
- Account history pause prevents new Anime/Movie account progress writes, while administrator-only YouTube history remains separate.
- Limitation: cross-origin embeds without an exposed seek API cannot be remotely seek-restored by the parent page.

## Phase 5 — Quality

- Focused route tests cover authentication/admin flows, preferences, profiles, export/delete and the provider-reference library path; account deletion tests also cover cleanup of Anime reference rows.
- The provider-reference integration tests exercise the Worker routing stack with the SQLite-backed D1 test adapter.
- The interface includes loading/error/empty states, responsive styles, keyboard search handling, skip-to-content and reduced-motion rules.
- **Not yet verified on the current feature head:** TypeScript typecheck, full Vitest suite, production dependency audit, production build, browser-based keyboard/accessibility checks and mobile browser checks.
- There is no lint script in `package.json`; lint is not marked complete.
- The current GitHub workflow does not run checks on a feature-branch push alone. No green Actions result is being claimed.

## Remaining before merge consideration

1. Run the full typecheck, tests, dependency audit and production build on the exact feature head; fix all failures.
2. Complete browser regression checks for account enrolment/deletion, library ownership, profile privacy, progress sync ordering, history pause, provider failures and mobile/keyboard interaction.
3. Verify live AniList/MAL/HiAnime responses and confirm how unavailable/removed provider titles should appear in saved libraries.
4. Re-check divergence against current `main`, then prepare a separate reviewed reconciliation. Do not merge or deploy during this implementation pass.

## Release and operational blockers

- Review additive migrations 0024 and 0025 before any remote D1 application.
- Reassess the current PBKDF2 configuration (100,000 iterations) against current OWASP guidance and actual Cloudflare Worker CPU limits before production use.
- Cloudflare Access remains a separately configured outer perimeter; any policy/validator change needs a separate decision.
- Do not deploy, alter edge policies, run remote D1 operations, wipe sessions or create real administrator credentials as part of this feature-branch coding work.

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
