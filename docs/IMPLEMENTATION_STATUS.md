# Implementation status

Source baseline: e1f8c78edcb437b64fefbdcc642183afad9d848d (main, 19 November 2026). Implemented means code/routes/tests exist; it does not prove every secret, licence or live provider has been verified.

## Runtime and CI
React 19 + TypeScript/Vite frontend, Hono Cloudflare Worker API, D1 persistence and configured KV cache. GitHub Actions validates Access config, audits production dependencies, typechecks, runs Vitest and builds.
The latest known main workflow on 19 November completed verification, applied staging D1 migrations, built and deployed Worker/static assets. Its anonymous remote health/readiness curl step was skipped because Cloudflare Access protects those paths; do not claim it proved live D1 readiness.

## Implemented features
### Anime
- AniList-first live catalogue in local/staging; MAL secondary fallback; optional HiAnime legacy compatibility.
- Native AniList seasonal/trending/genre/status/format filters, search, details, related titles and banner/poster artwork.
- Optional TMDB enrichment that fills gaps without changing AniList identity.
- Independent HiAnime/Jikan episode discovery and fail-closed playback validation. Discovery does not guarantee a playable source. ZokoAnime is off by default.
### Movies
- Independent TMDB discovery/search/genres/details/credits API and Noir frontend.
- Account-scoped Watchlist/Watched/Favorite state and shared playback snapshots.
- CineSrc is the only Movie playback provider. TMDB ingestion remains disabled.
### Accounts and sync
- Cloudflare Access JWT/email validation, automatic profile provision/linking and internal opaque HttpOnly Kairo session.
- One-time admin bootstrap and admin account routes; one-admin and 15-standard-account constraints.
- Account-scoped Anime history/library, Movies library refs, YouTube History/Watch Later and shared playback snapshots with retry/order handling.
- Guest browser storage is isolated from signed-in account state. Legacy password tables/helpers remain for history/tests; login returns 410 ACCESS_SIGN_IN_ONLY.
### YouTube
- Official YouTube Data API search, saved Kairo channels/feed, metadata/embedding flags, official IFrame playback, Kairo History and Watch Later.
- Frontend and Worker both enforce admin-only access.
- Not implemented: guest-facing general discovery, imported real YouTube subscriptions, personalized YouTube Home.

## Database
18 ordered additive migrations exist (0001–0018). Migration tests apply the full chain in SQLite and check Access/account invariants. Anime, Movies and YouTube schemas remain distinct; shared playback is a cross-domain resume layer.

## External config and approvals
- Production D1/KV/Access values are placeholders; production stays fail-closed.
- TMDB_ACCESS_TOKEN is required for Movie discovery and optional Anime artwork; confirm licence for intended use.
- MAL fallback requires optional MAL_CLIENT_ID; AniList needs no key.
- YouTube Data API/OAuth credentials are Worker secrets.
- Anime playback needs a specific approved resolver and host allowlist; do not promise all episodes are playable.
- Review Jikan/HiAnime terms before broader use; Kitsu is disabled/unverified; Manami importer is not implemented.
- public/_headers CSP is report-only; iframe sandboxing is active.

## Verification limits
Provider tests largely use hand-written fixtures. They validate mapping/contracts/error handling, not live API availability or terms. Run authenticated staging checks. UI/sync audits are point-in-time documents.

## Next priorities
1. Verify authenticated staging provider status and representative route calls with real Worker secrets; never print secret values.
2. Confirm a permitted Anime playback resolver works end-to-end.
3. Review provider terms and policy.
4. Decide whether guest YouTube discovery/subscription import is desired.
5. Re-run CSP, accessibility, responsive, library-sync and playback lifecycle checks.
6. Provision production only after explicit legal/security/config approval.