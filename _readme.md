# Repository root index

Root files contain npm/package and TypeScript/Vite/Vitest configuration, the Cloudflare Worker deployment manifest, static HTML shell and top-level project documentation.

## Start here
- [README](README.md) — quick start.
- [docs/REPO_HANDOFF.md](docs/REPO_HANDOFF.md) — detailed AI/engineer handoff.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — runtime/domain architecture.
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — route contracts.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — current staging-first runbook.

index.html loads src/main.tsx; vite.config.ts configures React/Cloudflare; vitest.config.ts runs tests in Node; tsconfig.json references app/node/worker projects; wrangler.jsonc configures Worker, SPA assets, environments and bindings; scripts/validate-wrangler-access.mjs validates Access config. .gitignore excludes secrets/build/cache; .env.example documents names only; package-lock.json pins npm dependencies. .github contains CI/Dependabot, migrations contains the 18-step D1 schema, src is React, worker is Hono, and public/logo/favicon/app-icons/social contain static assets.

Every tracked root file has a sibling guide; folder indexes are named _readme.md.
