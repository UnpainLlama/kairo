# Technical architecture

Current implementation map, reviewed 19 November 2026. PRODUCT_SPEC.md remains design intent; this file describes the repository as it exists.

## Runtime flow
One Vite build produces the React SPA and Hono Worker. The same Cloudflare Worker serves static assets and /api/*.
```text
index.html -> src/main.tsx -> AccountProvider + BrowserRouter -> src/App.tsx
  Anime pages -> same-origin /api/v1/catalog/* and /api/v1/anime/*
  Movies pages -> same-origin /api/v1/movies/*
  AdminOnly YouTube pages -> same-origin /api/v1/youtube/*

worker/index.ts (Hono)
  security/origin middleware
  Cloudflare Access JWT -> active email -> internal Kairo session
  Anime handlers -> live service -> AniList -> MAL -> optional HiAnime
    episode discovery -> HiAnime/Jikan; TMDB artwork enrichment is optional
  Movies API -> TMDB provider/service/repository
  YouTube OAuth/feed + official YouTube Data API media routes
  account-owned D1 routes + KV cache
```

## Frontend
- src/main.tsx mounts React, AccountProvider, BrowserRouter and App.
- src/App.tsx owns the route table, shared shell/SearchBar and AdminOnly YouTube gate.
- src/pages contains Anime, Movies, YouTube and shared account screens.
- src/components contains reusable cards/search/dropdowns and separate Anime/Movie/YouTube players.
- src/lib contains API contracts/client, account/browser persistence, search/season helpers, Movie/YouTube helpers and shared playback state.
- src/hooks contains account-scope hooks.
- src/styles.css contains the general shell/Anime styles; src/styles-netflix.css contains Movies Noir styles.
Do not assume old architecture sketches' src/features, src/theme or src/types directories exist.

## Worker
- worker/index.ts is the Hono composition root and middleware/route wiring.
- worker/auth and worker/admin implement Access identity, Kairo sessions, YouTube OAuth and admin operations.
- worker/live contains AniList-first live Anime adapters, handlers, fallback/cache and contracts.
- worker/episodes and worker/hianime contain independent episode providers and parser/client.
- worker/metadata contains provider-neutral normalization, matching, provenance/merge and legacy D1 metadata enrichment.
- worker/artwork contains optional TMDB Anime enrichment.
- worker/movies is an independent TMDB Movies domain.
- worker/youtube contains official YouTube media routes.
- worker/providers validates playback results and constructs the opt-in ZokoAnime URL.
- worker/repositories and worker/lib contain D1 query helpers and request validation.

## Identity and ownership
Cloudflare Access is the only interactive Kairo sign-in authority in protected environments. The Worker verifies the Access application JWT, resolves/provisions the profile and creates an internal opaque HttpOnly kairo_session bound to the current verified Access email. Local development can be guest when ACCESS_ENFORCED is not true; missing Access in staging/production is denied.
One administrator is provisioned once; D1 enforces one administrator and a 15-standard-account cap. All YouTube pages and routes are administrator-only. Account ownership always comes from the validated server session/current Access identity.

## Provider boundaries
**Anime:** local/staging LIVE_PROVIDERS=anilist,mal,hianime. AniList provides IDs, banners, native season/year/genre/status/format filters, trending, search, details and relations. A successful empty AniList seasonal/genre result is authoritative. MAL is secondary and needs MAL_CLIENT_ID; HiAnime is optional compatibility. Jikan is not default catalogue.
Episode discovery uses separate EPISODE_PROVIDERS (local Jikan; staging HiAnime then Jikan). Discovery is not a playable source. Only a Worker-returned HTTPS URL on an allowlisted host with valid expiry may reach a player. ZokoAnime remains disabled by default. TMDB Anime enrichment fills missing fields without changing identity.
**Movies:** TMDB discovery/search/details/genres/credits. Requires TMDB_ACCESS_TOKEN and feature/terms flags. D1 ingestion is disabled. CineSrc is the only Movie iframe, addressed by numeric TMDB ID.
**YouTube:** official YouTube Data API and IFrame Player API; administrator-only curated saved-channel feed, search, watch, Kairo History and Watch Later. No guest general discovery or subscription import.

## Persistence and security
D1 stores account/media data; KV caches expiring provider metadata, not sessions or personal data. Live AniList payloads are not copied into D1 as a mirror. Shared playback snapshots cover anime/movie/youtube; periodic cloud sync is 60 seconds plus event-driven flushes. Mutating routes validate Origin/Referer and SQL is parameterized. Iframe sandboxing is active; static CSP remains report-only pending staging review. GitHub remote health probes are skipped by default because Access protects the paths.

## Environments
Use docs/DEPLOYMENT.md. Production Wrangler D1/KV/Access values are placeholders and flags remain fail-closed. CI fixture tests and a successful staging deployment do not prove live third-party service availability or production readiness.