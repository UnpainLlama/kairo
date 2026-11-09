# Deployment: staging first

This is the authoritative deployment guide. It replaces the older steps in `README.md`, `docs/CLOUDFLARE_SETUP.md` and `docs/GITHUB_SETUP.md` (their `DEPLOY_ENABLED` variable and `db:migrate:remote` script no longer exist).

## 1. Architecture

| | Local development | Staging | Production |
|---|---|---|---|
| Worker name | `kairo-anime-platform` | `kairo-anime-platform-staging` | `kairo-anime-platform` (env `production`) |
| D1 database | local file, no Cloudflare account | `kairo-db-staging` | `kairo-db` |
| KV cache | none (memory) | `METADATA_CACHE` (staging namespace) | `METADATA_CACHE` (separate namespace) |
| Deployed by | nobody | GitHub Actions, on request | **Blocked until you approve** (section 8) |

Each environment has its own database and cache, so staging can never touch production data. The environment is chosen at build time with `CLOUDFLARE_ENV` (the Cloudflare Vite plugin's mechanism) and Wrangler's `--env` for migrations. Bindings and variables are not inherited between environments, so `wrangler.jsonc` declares them per environment.

The deploy workflow (`.github/workflows/deploy.yml`) runs: typecheck, tests and build, then (only when requested) the guards, D1 migrations, build, deploy, and a health check that fails the run if `/api/health` or `/api/ready` is unhealthy.

IDs for D1 and KV are identifiers, not credentials, so they may be committed to the public repo. **The API token is the only secret. Never paste it into chat, a file, or the repo.**

## 2. Set up staging (you do this once; about 20 minutes)

Dashboard labels change occasionally; if one differs slightly, look for the nearest match.

### 2a. Create the D1 database
1. Cloudflare dashboard > **Storage & databases** > **D1 SQL database** > **Create database**.
2. Name: `kairo-db-staging`. Create it.
3. Copy the **Database ID** (a UUID).

### 2b. Create the KV namespace
1. Dashboard > **Storage & databases** > **KV** > **Create** (a namespace).
2. Name: `kairo-cache-staging`.
3. Copy the **Namespace ID**.

### 2c. Put the two IDs in `wrangler.jsonc`
1. On GitHub, open `wrangler.jsonc` on your branch, click the pencil (edit).
2. In the **`staging`** block only, replace `REPLACE_WITH_STAGING_D1_DATABASE_ID` and `REPLACE_WITH_STAGING_KV_NAMESPACE_ID` with the two values. Leave the `production` placeholders alone.
3. Commit to the branch.

### 2d. Create the API token (the secret)
1. Open https://dash.cloudflare.com/profile/api-tokens > **Create Token**.
2. Use the **Edit Cloudflare Workers** template as the base, then make sure the token has, at **Account** level: **Workers Scripts: Edit**, **Workers KV Storage: Edit**, **D1: Edit**, **Account Settings: Read**. (This list comes from community deployment guides, not Cloudflare's own page. If a run fails with an authentication error, the message names the missing permission; add it.)
3. Account resources: include only your account. No zone permissions are needed (no custom domain).
4. Create the token and copy it once. You will paste it only into GitHub in the next step.
5. Find your **Account ID**: dashboard home, the account's menu (three dots) > **Copy account ID**, or the right-hand column of Workers & Pages.

### 2e. GitHub: environment and secrets
1. Repository > **Settings** > **Environments** > **New environment** > name it `staging`.
2. In `staging` > **Environment secrets** > add `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID`.
3. (Recommended now) Create a second environment named `production`, add yourself under **Required reviewers**, and add **no secrets yet**. This pre-builds the approval gate.
4. (Optional) Settings > **Secrets and variables** > **Actions** > **Variables** > `STAGING_DEPLOY_ENABLED` = `true` makes every merge to `main` deploy to staging automatically. Skip it to deploy only by hand.

### 2f. Deploy staging
1. Repository > **Actions** > **Build and deploy KAIRO** > **Run workflow**.
2. Choose your branch, set **target** to `staging`, run.
3. When it finishes, open the run's **Summary**. It shows the staging URL and the `/api/ready` response.

If the deploy log says the account needs a **workers.dev subdomain**, register one: dashboard > **Workers & Pages** > the subdomain setting. Then re-run.

## 3. What "staging works" means
Open these in a browser (replace the host with your staging URL):

| URL | Expect |
|---|---|
| `/api/health` | JSON, `"success":true`, `"environment":"staging"` |
| `/api/ready` | `"database":"ok"`, `"schema":"ok"`, `"cache":"kv"`, `"providers":["anilist"]` |
| `/api/v1/providers` | AniList enabled, Kitsu disabled and `termsVerified:false` |
| `/` | The site loads. The catalogue is **empty** until Phase 2, so you see the "catalogue is empty" notice. That is correct. |

`/api/ready` returns 503 with "Apply migrations" if the database is reachable but unmigrated, and 503 if D1 is unreachable.

## 4. Environment variables and bindings

| Name | Kind | Where set | Purpose |
|---|---|---|---|
| `DB` | D1 binding | `wrangler.jsonc` per environment | Catalogue and, later, user data |
| `METADATA_CACHE` | KV binding | `wrangler.jsonc` per environment | Short-lived provider response cache (needed on workers.dev) |
| `APP_ENV` | var | `wrangler.jsonc` | `development`, `staging`, `production` |
| `METADATA_PROVIDERS` | var | `wrangler.jsonc` | Enabled metadata providers. `anilist` now; add `kitsu` only after its terms are verified |
| `ALLOWED_ORIGIN` | var, optional | not set | Only for cross-origin API use |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub environment **secrets** | GitHub only | Deploying. Never in the repo or the Worker |
| `STAGING_DEPLOY_ENABLED` | GitHub variable | GitHub | Auto-deploy staging on merge to main |
| `STAGING_URL` | GitHub variable, optional | GitHub | Fallback if the deploy log URL cannot be read |
| `PRODUCTION_DEPLOY_APPROVED` | GitHub variable | GitHub | Must be `true` for any production deploy. **Do not set.** |

The Worker needs **no secrets today** (public AniList reads need no key). Authentication in Phase 4 will add some, set with `wrangler secret put` or the dashboard, never in the repo.

## 5. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "Replace the REPLACE_WITH_STAGING_... placeholders" | Step 2c not done or committed to a different branch |
| "CLOUDFLARE_API_TOKEN ... missing" | Secrets were added to the repository, not to the `staging` **environment**, or the environment name differs |
| Authentication error / code 10000 | Token lacks a permission (step 2d), or the Account ID is wrong |
| `d1 migrations` cannot find the database | Wrong database ID in the `staging` block |
| `/api/ready` returns 503 "Apply migrations" | The migrate step did not run; re-run the workflow |
| `/api/ready` shows `"cache":"none"` | The KV binding is missing or the ID placeholder was not replaced |
| `/api/...` shows the website instead of JSON | `run_worker_first` was removed from `assets` in `wrangler.jsonc` |

## 6. Rollback
- Worker: dashboard > Workers & Pages > the Worker > **Deployments** > roll back to a previous version. 
- Database: migrations are additive-only and the previous Worker version works against the newer schema, so a code rollback needs no database rollback.

## 7. Verified vs assumed
**Verified in a sandbox:** the generated staging config (Worker name, D1, KV, vars); a Wrangler dry-run deploy; migrations 0001 and 0002 applied by Wrangler to a local D1, twice (second run: nothing to apply); the built Worker running in the Workers runtime locally, serving `/api/health`, `/api/ready` (200 when migrated, 503 when not), JSON API routes, and the SPA fallback; typecheck, 73 tests, build.

**Not verified (needs your Cloudflare account):** the real remote deploy, remote migrations, KV reads/writes, the token's exact permission set, and the workflow's deploy job. The first staging run is the test; its health check will say whether it worked.

## 8. Production (blocked)
Production deploys are blocked by design until you approve. They need all of: a separate D1 database and KV namespace, their IDs in the `production` block, a separate token in the `production` environment, the variable `PRODUCTION_DEPLOY_APPROVED=true`, a run from `main`, and your approval as required reviewer. Do none of this until staging is proven with a real catalogue.

### Approved playback host allowlist

The HiAnime playback resolver is fail-closed. The staging Wrangler configuration currently allows these exact HTTPS hosts, supplied by the project operator: `zokoanime.video`, `megaplay.buzz`, `hls.dramahot.top`, `hls1drama1.cfd`, `mysubplay.com`, `emeralddrift.com`, and `hianime.at`. The list is configured only in the staging environment; local development remains empty and production remains unchanged. Confirm that each host is covered by the relevant provider's playback permissions before deploying. Add only exact approved hostnames (comma-separated); `*.example.com` matches subdomains only. Do not add broad wildcard domains. The Worker still rejects HTTP URLs, credentials, nonstandard ports, expired URLs, and hosts outside this list.
