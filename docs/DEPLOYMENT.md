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

IDs for D1 and KV are identifiers, not credentials, so they may be committed to the public repo. Cloudflare API tokens, OAuth client secrets, and encryption keys are credentials: keep them only in the appropriate GitHub or Cloudflare secret stores. Never paste a secret into chat, a file, or the repo.

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
| `/api/ready` | `"database":"ok"`, `"schema":"ok"`, and `"cache":"kv"`. In live catalogue mode this still verifies D1 because account, library and watch-history routes depend on it. |
| `/api/v1/providers` | The configured live catalogue providers, independent episode providers, attribution details and artwork provider. Do not assume the legacy DB-mode AniList/Kitsu response. |
| `/` | The site loads and displays results from the configured live catalogue providers. The catalogue is not expected to be empty in live mode. |

`/api/ready` returns 503 if D1 is unreachable, if any required migration table is missing, or if the extended `user_profiles` account columns are unavailable. It does not call external catalogue providers, so the readiness probe does not consume their rate limits.

## 4. Environment variables and bindings

| Name | Kind | Where set | Purpose |
|---|---|---|---|
| `DB` | D1 binding | `wrangler.jsonc` per environment | Catalogue (DB mode) and account, library, session and watch-history data (all modes) |
| `METADATA_CACHE` | KV binding | `wrangler.jsonc` per environment | Short-lived provider response cache (needed on workers.dev) |
| `APP_ENV` | var | `wrangler.jsonc` | `development`, `staging`, `production` |
| `APP_BASE_URL` | Worker variable | `wrangler.jsonc` per environment | Canonical public origin used to construct OAuth callback and return URLs |
| `GOOGLE_CLIENT_ID` | Worker variable | `wrangler.jsonc` per environment | Google OpenID Connect and explicit YouTube authorization client |
| `METADATA_PROVIDERS` | var | `wrangler.jsonc` | Enabled metadata providers. `anilist` now; add `kitsu` only after its terms are verified |
| `ALLOWED_ORIGIN` | var, optional | not set | Only for cross-origin API use |
| `GOOGLE_CLIENT_SECRET` | Worker secret | Cloudflare Worker environment | Required for Google sign-in and account linking |
| `YOUTUBE_TOKEN_ENCRYPTION_KEY` | Worker secret | Cloudflare Worker environment | Required for YouTube token encryption; 32 random bytes, unpadded base64url |
| `TMDB_ACCESS_TOKEN` | Worker secret, optional | Cloudflare Worker environment | Optional TMDB artwork enrichment |
| `YOUTUBE_STAGING_TOKEN` | Worker secret, optional | Cloudflare staging environment only | Staging-only YouTube feed experiment; not a production feature |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub environment **secrets** | GitHub only | Deploying. Never in the repo or the Worker |
| `STAGING_DEPLOY_ENABLED` | GitHub variable | GitHub | Auto-deploy staging on merge to main |
| `STAGING_URL` | GitHub variable, optional | GitHub | Fallback if the deploy log URL cannot be read |
| `PRODUCTION_DEPLOY_APPROVED` | GitHub variable | GitHub | Must be `true` for any production deploy. **Do not set.** |

Authentication is already implemented. Set `GOOGLE_CLIENT_SECRET` and `YOUTUBE_TOKEN_ENCRYPTION_KEY` in Cloudflare's staging Worker **Secrets** before testing Google sign-in or YouTube connection. Keep `APP_BASE_URL` and `GOOGLE_CLIENT_ID` in the staging Worker variables. Generate the YouTube encryption key from 32 cryptographically random bytes and encode it as unpadded base64url. Do not put Worker secrets in GitHub Actions logs or source control.

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
**Verified on 2026-11-12:**
- GitHub Actions typecheck, all 19 test files (163 tests at the latest verified commit), and worker/client production builds passed on the `youtube` promotion PR. The deploy job was skipped for the pull request.
- A read-only remote Wrangler migration listing against staging reported `0007_youtube_oauth.sql` as the only migration to be applied. This indicates migrations 0001–0006 are already recorded as applied on the staging D1 journal; no migration was applied by the inspection command.
- A staging Worker deployment was performed from the older `main` snapshot before this promotion PR was merged. It returned healthy `/api/health` and `/api/ready` responses, but that old live-mode readiness handler reported `database: "not used"`. Wrangler also warned that the old `main` config omitted the canonical `APP_BASE_URL` and `GOOGLE_CLIENT_ID` variables present on `youtube`.

**Still to verify before enabling account features on staging:**
- Merge/review the current `youtube` promotion PR, then deploy the promoted commit to staging. The final `/api/ready` should report both `database: "ok"` and `schema: "ok"`.
- Confirm the staging Worker secrets `GOOGLE_CLIENT_SECRET` and `YOUTUBE_TOKEN_ENCRYPTION_KEY` exist. Cloudflare does not expose secret values for read-back; verify by running a controlled sign-in / YouTube connection test after deployment.
- Confirm the exact YouTube and Google callback URLs are registered in the Google OAuth client.
- Validate provider endpoints and Jikan/MyAnimeList terms as described in `docs/LIVE_CATALOGUE.md`. The staging deploy's `cache: "kv"` proves the binding is present, not that every KV read/write path has been exercised.
- Migration `0007_youtube_oauth.sql` remains pending on staging until a reviewed staging deployment applies it. Production remains blocked and untouched.

## 8. Production (blocked)
Production deploys are blocked by design until you approve. They need all of: a separate D1 database and KV namespace, their IDs in the `production` block, a separate token in the `production` environment, the variable `PRODUCTION_DEPLOY_APPROVED=true`, a run from `main`, and your approval as required reviewer. Do none of this until staging is proven with a real catalogue.

### Approved playback host allowlist

The HiAnime playback resolver is fail-closed. The staging Wrangler configuration currently allows these exact HTTPS hosts, supplied by the project operator: `zokoanime.video`, `megaplay.buzz`, `hls.dramahot.top`, `hls1drama1.cfd`, `mysubplay.com`, `emeralddrift.com`, and `hianime.at`. The list is configured only in the staging environment; local development remains empty and production remains unchanged. Confirm that each host is covered by the relevant provider's playback permissions before deploying. Add only exact approved hostnames (comma-separated); `*.example.com` matches subdomains only. Do not add broad wildcard domains. The Worker still rejects HTTP URLs, credentials, nonstandard ports, expired URLs, and hosts outside this list.
