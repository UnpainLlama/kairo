# Cloudflare setup and deployment runbook

> **Superseded for deployment:** follow [docs/DEPLOYMENT.md](DEPLOYMENT.md) (staging first). The `DEPLOY_ENABLED` variable and the `db:create` / `db:migrate:remote` scripts mentioned below no longer exist.


This project uses Cloudflare Workers with the Cloudflare Vite plugin. The Worker serves the React app's static assets and routes `/api/*` requests to the backend. D1 stores relational data.

## 1. Prerequisites

- A Cloudflare account.
- Node.js 20.19+ or 22.12+ and npm.
- Git.
- A terminal.

From the project root:

```bash
npm install
npx wrangler login
npx wrangler whoami
```

The browser login authenticates local Wrangler. Do not commit credentials or local Wrangler state.

## 2. Create D1

```bash
npx wrangler d1 create kairo-db
```

Copy the returned database UUID into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`. Keep `database_name` as `kairo-db` unless you also change the migration scripts.

Apply locally:

```bash
npm run db:migrate:local
```

Apply to the remote Cloudflare D1 database:

```bash
npm run db:migrate:remote
```

For production, review migrations before applying them. Migrations are versioned in `migrations/`; never edit a migration that has already been applied to a shared database. Create a new migration instead.

## 3. Local development

```bash
npm run dev
```

The Cloudflare Vite plugin runs the Worker in the Workers runtime locally and supports local bindings. Use this rather than mocking Worker APIs with browser globals.

Build and preview:

```bash
npm run build
npm run preview
```

Worker types can be generated from Wrangler configuration:

```bash
npm run cf:typegen
```

## 4. Configure secrets and variables

Non-secret configuration belongs in `wrangler.jsonc` under `vars` only when it is safe to commit. Private credentials must be stored as Worker secrets.

Example:

```bash
npx wrangler secret put IDENTITY_PROVIDER_CLIENT_SECRET
npx wrangler secret put PROVIDER_SERVER_TOKEN
```

Use names matching the integrations actually implemented. Do not add unused secret declarations. Never paste production secrets into Claude, source files, issue trackers, or GitHub commits.

For local secret values, create `.dev.vars` in the project root. It is gitignored. Example structure only:

```dotenv
IDENTITY_PROVIDER_CLIENT_SECRET="local-development-value"
PROVIDER_SERVER_TOKEN="local-development-value"
```

Use test credentials locally and rotate any credential that is accidentally exposed.

## 5. Optional KV cache

Only add KV after implementing a public metadata cache. Create a namespace:

```bash
npx wrangler kv namespace create CATALOG_CACHE
```

Add the returned ID to `wrangler.jsonc` under `kv_namespaces` with binding `CATALOG_CACHE`. For local testing, Wrangler provides local KV emulation. Never store session data or personal records in a shared public cache.

## 6. Optional R2 artwork storage

Only use R2 for artwork the project owns or has permission to store:

```bash
npx wrangler r2 bucket create kairo-artwork
```

Add an `r2_buckets` binding in `wrangler.jsonc` after creating the bucket. Keep upload operations authenticated and validate file type, size, ownership, and content. Never assume an arbitrary remote image can be copied into R2.

## 7. Configure production

1. Replace the placeholder D1 ID.
2. Update Worker name in `wrangler.jsonc`.
3. Configure an authorized identity provider.
4. Configure approved metadata and playback provider credentials as Worker secrets.
5. Apply remote migrations.
6. Build and deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

The first deployment provides a `workers.dev` URL if enabled on the account. Add a custom domain in Cloudflare's Workers & Pages dashboard, or configure a route as appropriate for your zone.

## 8. Verify production

Check:

- `https://YOUR_WORKER_HOST/api/health`
- `https://YOUR_WORKER_HOST/api/v1/catalog/featured`
- Homepage static assets load.
- Search returns D1-backed results after data is imported.
- CORS is same-origin or explicitly restricted.
- HTTPS is active on the custom domain.
- Secrets are configured in the production environment.
- D1 migrations are current.
- No placeholder database IDs remain.

## 9. Environments

Use separate D1 databases and Worker environments for development/staging/production when the project becomes a team or production service. Never run destructive experiments against production. Cloudflare environment bindings and secrets must be configured per environment; do not assume secrets automatically inherit.

## 10. Troubleshooting

- **Wrangler says database ID is invalid:** replace the placeholder with the UUID returned by `wrangler d1 create`.
- **D1 table missing:** run local or remote migrations against the intended database.
- **Worker deploy fails in CI:** check API token scopes, account ID, Worker name, and build logs.
- **SPA routes 404:** confirm `assets.not_found_handling` is set to `single-page-application` in the Wrangler input configuration.
- **API route receives HTML:** verify Worker routing configuration and `/api/*` route handler paths.
- **Local secrets not loaded:** ensure `.dev.vars` is at project root and matches the names the Worker reads.
