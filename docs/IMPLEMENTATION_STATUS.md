# Implementation status

Working log for the master build prompt. Update after each session.

## Verified so far

- `worker/lib/validation.ts` — pagination, search/filter/sort whitelist, id, library and progress body validation. 14 tests.
- `worker/providers/playback.ts` — authorized-playback contract: HTTPS-only, per-provider host allowlist, no embedded credentials, expiry check, timeout, stable error mapping, unknown fields dropped. 7 tests.
- Both modules pass `tsc --strict`. Tests pass under a stand-in runner; **they have not yet run under real Vitest** (dependencies could not be installed in the authoring sandbox).
- Neither module is wired into `worker/index.ts` yet.

## Not yet verified (needs `npm install` with network)

`npm run typecheck`, `npm test`, `npm run build`, `wrangler` commands, and the pinned versions in `package.json` (notably `@cloudflare/workers-types`, `@cloudflare/vite-plugin`, `wrangler`, `compatibility_date`).

## Gaps found in the starter

**Frontend**
1. `App.tsx` renders the home page for every URL. Routes in `PRODUCT_SPEC.md` (`/search`, `/browse/:category`, `/anime/:slug`, `/watch/:episodeId`, `/library`, `/profile`, `/settings`) do not exist, so cards, rail links and the mobile nav lead to the home page.
2. Inert controls: "View all", hero pagination dots, footer links, profile buttons; the `⌘ K` hint has no handler.
3. Demo content can pass as live: "Continue your journey" is a slice of the catalogue, and demo items show ratings. Continue Watching must be signed-in progress only.
4. Search is a client-side filter over 8 demo items, not `/api/v1/catalog/search`.
5. Saved titles live in `localStorage`; the spec requires an account-scoped library.
6. Type scale goes down to 6–9px in places; needs a contrast and size pass in all four themes.
7. Search panel and theme switcher lack dialog/combobox/menu semantics.

**Worker / data**
8. Implemented: health, featured, search, details, episodes. Missing: trending, latest, genres, related, readiness, all `/me/*` routes (two stubs return 401), real playback.
9. Search ignores filters and sort. `parseSearchParams` + `SORT_ORDER_BY` are ready for this.
10. No auth middleware or identity-provider choice yet.
11. Schema has no genre or related-title tables; preferences lack subtitle styling and privacy fields. Add via new migrations only.
12. Security headers are set on `/api/*` only.

**Tooling**
13. No lint script or ESLint config; `hls.js` not a dependency.
14. CI uses `npm install` and runs neither tests nor lint. No lockfile committed.

## Suggested next order

1. `npm install`; run typecheck/test/build; fix what the real toolchain reports.
2. Wire validation into existing routes; add trending/latest/genres/related.
3. Frontend routes + API-backed pages (search, detail, browse) with loading/empty/error states.
4. Identity provider decision, then `/me/*` routes with ownership checks.
5. Player + progress sync behind the playback boundary.
