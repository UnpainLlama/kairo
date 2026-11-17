# Kairo

Kairo is a closed-access React, TypeScript, Vite and Cloudflare Workers media-discovery application for Anime, Movies and administrator-only YouTube features.

## Project areas

- **Anime:** catalogue discovery, metadata enrichment, episode discovery and provider-gated playback.
- **Movies:** TMDB-powered catalogue search and details, with **CineSrc as the only movie playback provider**.
- **YouTube (administrator only):** video/channel discovery and a saved channel feed through the official YouTube Data API. Standard accounts and anonymous visitors cannot access YouTube pages or APIs.

## Movie provider boundary

TMDB supplies Movies discovery, search, metadata and the numeric movie IDs used by Kairo. CineSrc is the sole Movie playback provider and is embedded through its documented iframe URL:

`https://cinesrc.st/embed/movie/{tmdb_id}`

There is no VidLink integration, alternate Movie player, or Kairo-side stream extraction fallback. CineSrc's iframe embed does not require a Kairo Worker secret. See [docs/CINESRC_SETUP.md](docs/CINESRC_SETUP.md) and the [official CineSrc documentation](https://cinesrc.st/docs).

## Local development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run build
```

Closed-access account provisioning, administrator email verification, and staging-only activation are documented in [docs/CLOSED_ACCESS_SETUP.md](docs/CLOSED_ACCESS_SETUP.md). Cloudflare environments, D1 migrations, Worker secrets and release gates are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the wider system design.

## Repository conventions

- Keep secrets in Cloudflare Worker secrets or local git-ignored files; never commit credentials.
- Keep migrations additive and versioned.
- Keep provider integrations behind their current domain boundaries.
- Retain automated tests and CI checks; remove scratch prototypes and one-off setup artifacts once superseded.
