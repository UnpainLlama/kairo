# Kairo

Closed-access React/TypeScript media discovery app served by a Cloudflare Worker.

## Start here
- [Detailed AI/engineer handoff](docs/REPO_HANDOFF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/API_CONTRACT.md)
- [Access identity](docs/ACCOUNT_ARCHITECTURE.md)
- [Current deployment runbook](docs/DEPLOYMENT.md)
- [AniList-first Anime catalogue](docs/LIVE_CATALOGUE.md)
- [Movies architecture](docs/MOVIES_ARCHITECTURE.md) and [CineSrc setup](docs/CINESRC_SETUP.md)
- [YouTube implementation status](docs/YOUTUBE_PROVIDER_PLAN.md)

Every tracked file and folder has a companion guide: adjacent <filename>_readme.md files and folder _readme.md indexes. The root _readme.md indexes top-level files.

## Product areas
- **Anime:** AniList primary, MAL secondary compatibility fallback, optional HiAnime; independent episode discovery and fail-closed playback.
- **Movies:** TMDB catalogue/metadata; CineSrc is the only Movie playback provider. No VidLink or stream extraction.
- **YouTube:** administrator-only official Data API and IFrame API integration, Kairo-curated channels, History and Watch Later. Not public guest discovery or imported YouTube subscriptions.

## Local development
Requirements: Node.js 22 and npm.
```bash
npm ci
npm run dev
```

```bash
npm run typecheck
npm test
npm run build
npm run db:migrate:local
```

## Important boundaries
- Cloudflare Access is the only interactive Kairo sign-in authority in protected environments. No standard username/password login.
- The Worker derives ownership from verified Access identity/internal HttpOnly session; never trust a client-supplied user ID.
- Keep Anime, Movies and YouTube schemas/providers separate. Keep migrations additive and never edit one already applied to shared D1.
- Keep credentials in .dev.vars locally or Worker secrets, never in source/Vite variables.
- Anime playback accepts only Worker-returned validated sources. Never accept arbitrary browser URLs or proxy third-party streams.
- Anonymous deployment health probes are skipped by default because Cloudflare Access protects those paths; successful deployment does not prove live DB readiness.

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the current implementation and limitations.