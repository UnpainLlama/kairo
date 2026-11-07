# KAIRO — Anime Discovery Platform Starter

> **Superseded for deployment:** follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (staging first). The `DEPLOY_ENABLED` variable and the `db:create` / `db:migrate:remote` scripts mentioned below no longer exist.


A design-forward, implementation-ready starter pack for a premium anime discovery and licensed-playback web application. This pack includes the product brief, a detailed build prompt for Claude, design tokens, API contracts, Cloudflare Worker + D1 scaffolding, GitHub Actions deployment, and setup documentation.

> **Scope:** The starter is designed for authorized catalogue metadata and playback providers. It does not implement third-party scraping, access-control circumvention, protected-stream extraction, or decryption of provider-protected payloads. Connect providers only when their terms and permissions allow it.

## What is included

- `CLAUDE_MASTER_PROMPT.md` — paste this into Claude to guide full implementation.
- `docs/PRODUCT_SPEC.md` — page-by-page product and UX requirements.
- `docs/DESIGN_SYSTEM.md` — original visual direction, four palettes, type, layouts, character-art rules, and component behavior.
- `docs/ARCHITECTURE.md` — application architecture and provider boundaries.
- `docs/API_CONTRACT.md` — versioned REST contracts and response formats.
- `docs/CLOUDFLARE_SETUP.md` — Workers, Vite, D1, local development, bindings, secrets, and deployment.
- `docs/GITHUB_SETUP.md` — repository setup and GitHub Actions deployment.
- `docs/SECURITY_AND_CONTENT.md` — security, privacy, and authorized content requirements.
- `docs/IMPLEMENTATION_ROADMAP.md` — build sequence and acceptance checklist.
- `worker/index.ts` — working Worker API starter with health and D1-backed catalogue endpoints.
- `migrations/0001_initial_schema.sql` — initial D1 schema.
- `src/` — React interface starter with a cinematic home screen, navigation, theme switching, and demo catalogue data.
- `.github/workflows/deploy.yml` — CI build and Cloudflare deploy workflow.

## Quick start

Prerequisites: Node.js 20.19+ or 22.12+, npm, a Cloudflare account, and a GitHub account.

```bash
npm install
npx wrangler login
npx wrangler whoami
```

Create the D1 database and copy the returned database ID into `wrangler.jsonc`:

```bash
npx wrangler d1 create kairo-db
```

Apply the schema locally:

```bash
npm run db:migrate:local
```

Start the app:

```bash
npm run dev
```

Build and preview using the Cloudflare Vite plugin:

```bash
npm run build
npm run preview
```

Deploy from your machine after updating the D1 database ID:

```bash
npm run db:migrate:remote
npm run deploy
```

See the complete runbooks in `docs/CLOUDFLARE_SETUP.md` and `docs/GITHUB_SETUP.md` before production deployment.

## Important configuration

1. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the ID returned by `wrangler d1 create`.
2. Change the Worker name and app branding before deployment.
3. Add a real metadata provider through the typed provider interface described in `docs/ARCHITECTURE.md`.
4. Configure an established identity provider before enabling personal accounts. Do not roll your own password storage.
5. Supply original, licensed, or otherwise authorized artwork in `public/artwork/`. The bundled visual uses CSS compositions and clearly marked demo content.
6. Configure GitHub repository secrets as described in `docs/GITHUB_SETUP.md`.

## Current implementation status

The included UI is a functional visual starter. The Worker implements health, featured catalogue, search, and anime-detail read routes backed by D1. Account authentication, personal library mutations, progress synchronization, provider-specific catalogue ingestion, and authorized playback integrations are defined as implementation targets in the specification but are not falsely represented as complete.

## Recommended first implementation session

Give Claude `CLAUDE_MASTER_PROMPT.md` together with the entire extracted folder. Ask it to inspect every included file, preserve the existing deployment scaffolding, and implement the remaining features in the roadmap. Do not provide production secrets to a coding assistant; use placeholder environment names and configure real values only in Cloudflare/GitHub secret stores.
