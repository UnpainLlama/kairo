# Repository handoff — Kairo

Reviewed against main commit e1f8c78edcb437b64fefbdcc642183afad9d848d on 19 November 2026. Source, tests and active environment configuration remain authoritative.

## Product
Kairo is a closed-access React/TypeScript media-discovery app served by one Hono Cloudflare Worker. D1 stores account-owned data; Workers KV caches expiring public provider metadata.

- **Anime:** AniList-first catalogue/discovery, optional MAL/HiAnime compatibility, independent episode discovery and a fail-closed playback boundary.
- **Movies:** independent TMDB discovery/search/details/library; CineSrc is the sole Movie playback iframe.
- **YouTube:** administrator-only Kairo-curated channel feed/search, official iframe playback, Kairo History and Watch Later. This is not guest-facing general discovery or imported subscriptions.

## Read these first
1. README.md — quick start.
2. ARCHITECTURE.md — current runtime and domain map.
3. ACCOUNT_ARCHITECTURE.md and CLOSED_ACCESS_SETUP.md — Access identity and administrator bootstrap.
4. API_CONTRACT.md — Worker route/envelope/ownership contract.
5. LIVE_CATALOGUE.md, MOVIES_ARCHITECTURE.md and YOUTUBE_PROVIDER_PLAN.md — provider details.
6. DEPLOYMENT.md — only active deployment runbook.
7. Open the containing folder's _readme.md and the adjacent <filename>_readme.md before changing a file.

## Runtime graph
```text
index.html -> src/main.tsx -> AccountProvider + BrowserRouter -> src/App.tsx
  Anime UI -> /api/v1/catalog/* and /api/v1/anime/*
  Movies UI -> /api/v1/movies/*
  AdminOnly YouTube UI -> /api/v1/youtube/*

worker/index.ts (Hono)
  request/security/origin middleware
  Cloudflare Access JWT -> active email -> HttpOnly Kairo session
  Anime live handlers -> service -> AniList -> MAL -> optional HiAnime
    separate episode service -> HiAnime/Jikan
    optional TMDB artwork enrichment
  Movies routes -> TMDB provider/service/repository
  YouTube OAuth/feed + official Data API media routes
  account-owned D1 routes + expiring KV cache
```
React must call Kairo's same-origin API. Provider credentials and server-side orchestration stay in the Worker.

## Identity and ownership
Cloudflare Access is the only interactive Kairo sign-in authority in protected environments. The Worker verifies the Access application JWT, resolves/provisions the profile using the verified email and creates an internal opaque HttpOnly kairo_session cookie. The internal session is bound to the current Access email. Local development can run guest mode when ACCESS_ENFORCED is not true; staging/production missing identity is denied, not guest.

One administrator is provisioned once; D1 enforces one admin and a 15-standard-account limit. Admin bootstrap requires the verified Access identity plus temporary ADMIN_BOOTSTRAP_TOKEN. All YouTube routes are administrator-only in both React and Worker. Never widen the Access Allow policy to Everyone or an entire domain.

Legacy password tables and PBKDF2 helpers remain for compatibility/tests; they are not ordinary sign-in. The normal password login endpoint returns 410 ACCESS_SIGN_IN_ONLY.

## Provider configuration
| Area | Current order/role | Important limitation |
|---|---|---|
| Anime catalogue | AniList primary; MAL second; optional HiAnime | Local/staging LIVE_PROVIDERS=anilist,mal,hianime. MAL needs MAL_CLIENT_ID. |
| Episode discovery | Separate registry; local Jikan, staging HiAnime then Jikan | Discovery metadata does not guarantee a playable stream; review provider terms. |
| Anime artwork | Optional TMDB | Needs TMDB_ACCESS_TOKEN; does not change AniList identity. |
| Anime playback | Validated resolver boundary | No arbitrary client URLs or stream extraction; ZokoAnime is disabled by default. |
| Movies | TMDB catalogue; CineSrc playback only | Staging needs TMDB_ACCESS_TOKEN; D1 ingestion remains disabled. |
| YouTube | Official Data API + IFrame API | Admin-only curated feed/search/history; not real YouTube subscriptions. |

See wrangler.jsonc for environment values. Secrets belong in local git-ignored .dev.vars or Cloudflare Worker secrets, never committed source or Vite/client variables.

## Data map
- migrations/ contains the ordered 18-migration D1 history. Applied migrations are immutable; append a new numbered migration.
- Live Anime provider responses are short-lived cache data, not a full D1 mirror.
- Movies has its own contracts and tables; it does not reuse Anime rows.
- Kairo YouTube saved channels are app-curated and distinct from actual YouTube subscriptions.
- Account ownership always comes from server-validated session/Access identity, never request-body user IDs.
- Guest browser state is separate from signed-in state. Shared media playback snapshots cover anime, movie and youtube.

## Development
Requirements: Node.js 22 and npm.
```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```
For a new local D1 database, use npm run db:migrate:local. Vitest runs in Node; many provider tests use hand-written fixtures and do not prove live upstream availability or terms.

## Deployment state and limitations
The latest known main workflow on 19 November 2026 passed verification, applied staging D1 migrations, built and deployed Worker/assets. Its anonymous remote health/readiness curl step was skipped by design because Cloudflare Access protects those paths at the edge. Production remains fail-closed with placeholder D1/KV/Access values.

Next-owner checks:
1. Verify authenticated staging provider status and representative Anime/Movies/YouTube requests with real Worker secrets; never print secret values.
2. Confirm an approved Anime playback resolver works end-to-end; otherwise keep the unavailable state.
3. Review Jikan/HiAnime terms. Kitsu remains disabled/unverified and the Manami dataset importer is not implemented.
4. YouTube general guest discovery and subscription import are not implemented.
5. Keep TMDB Movie ingestion off until storage/licence approvals are explicit.
6. Review CSP reports; public/_headers uses Content-Security-Policy-Report-Only while iframe sandboxing is active.
7. Production provisioning, legal review, backup/rollback and explicit approval remain outstanding.

Every tracked file has an adjacent <filename>_readme.md and every folder has _readme.md. These are navigation aids; update them when source responsibilities or connections change.