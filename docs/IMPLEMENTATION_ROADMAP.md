# Implementation roadmap

This replaces the original blank-slate checklist. See IMPLEMENTATION_STATUS.md for current completion.

## Completed in source
- [x] React/Vite SPA and routed Anime, Movies and administrator YouTube workspaces.
- [x] Hono Worker API, input validation, JSON envelopes and same-origin mutation guard.
- [x] AniList-first Anime catalogue with native seasonal/trending/genre discovery, search/details/related and fallback/cache.
- [x] Optional TMDB Anime art enrichment and independent TMDB Movies API.
- [x] Separate episode discovery and fail-closed playback URL validation.
- [x] Cloudflare Access JWT validation, HttpOnly Kairo sessions, account provisioning/linking and one-time admin bootstrap.
- [x] Account-scoped history/library and unified Anime/Movie/YouTube playback with retry/order handling.
- [x] CineSrc-only Movie playback.
- [x] Admin-only YouTube curated feed/search/watch, official iframe player, Kairo History and Watch Later.
- [x] 18 additive D1 migrations, CI verification/deploy workflow and automated tests.
- [x] Per-file and per-folder handoff documentation.

## Remaining tasks
### Staging/provider verification
- [ ] Authenticated staging check of /api/v1/providers, Anime featured/seasonal/details/episodes, Movies discovery/search/detail and admin YouTube routes.
- [ ] Record live response checks separately from fixture tests; monitor AniList rate limits/fallback.
### Anime playback/provider policy
- [ ] Confirm permitted episode/server providers and a specific resolver that returns validated playable sources.
- [ ] Verify iframe sandbox, expiry, subtitles and progress restore in staging.
- [ ] Review Jikan/HiAnime terms; keep Kitsu disabled until verified; keep Manami importer unbuilt until licence/retention review.
### Movies and YouTube
- [ ] Keep Movie ingestion off until licence/storage/attribution approved.
- [ ] Decide separately on YouTube guest discovery or subscriptions import; current Kairo feed is curated, not subscriptions.
- [ ] Preserve AdminOnly checks in React and Worker.
### Security/accessibility
- [ ] Review report-only CSP reports before enforcing CSP.
- [ ] Re-run keyboard/screen-reader/reduced-motion/responsive/contrast checks.
- [ ] Verify guest/account isolation, deletion markers and multi-tab playback ordering.
### Production
- [ ] Provision production D1/KV/Access/secrets; remove placeholders.
- [ ] Review/apply migrations after backup/change review.
- [ ] Complete provider legal/policy checks; document rollback/restore.
- [ ] Obtain explicit production approval before setting PRODUCTION_DEPLOY_APPROVED=true.

## Release acceptance
Every user-data route derives ownership server-side; providers are authorized; media embeds are sandboxed/source-validated; production config has no placeholders; migrations and provider terms are reviewed; automated checks and real staging integration checks pass.