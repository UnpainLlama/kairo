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

The deploy workflow (`.github/workflows/deploy.yml`) always runs typecheck, tests and build. A requested deployment then checks its release guards before it can back up D1, apply migrations or deploy the Worker. Live `/api/health` and `/api/ready` probes are mandatory for deployment: configure exact Cloudflare Access Worker-destination overrides for those paths, verify both endpoints return healthy JSON without an Access login, and then set `KAIRO_REMOTE_HEALTH_CHECKS_ENABLED=true` in the target GitHub Actions environment. Until that variable is enabled, the deploy guard fails before any remote D1 backup, migration or Worker deployment; CI verification still runs.

Cloudflare Access must also have an exact public destination override for `/api/v1/auth/logout` (the application path override is path-scoped). This one path is intentionally allowed through to the Worker so an expired or denied Access identity can sign out. The Worker enforces same-origin on the POST and revokes only the session token supplied in that request's HttpOnly cookie. Do not create a broader `/api/v1/auth/*` or `/api/*` bypass. This exception is separate from the anonymous health/readiness probes and does not make any account-data endpoint public.

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
4. (Optional; enable only after staging setup is complete) Settings > **Secrets and variables** > **Actions** > **Variables** > `STAGING_DEPLOY_ENABLED` = `true` makes every push to `main` attempt a staging deployment. Leave it unset during setup to keep pushes verification-only; otherwise the deploy job will run and fail its safety guard until the staging health/readiness overrides have been configured and `KAIRO_REMOTE_HEALTH_CHECKS_ENABLED=true` has been added to the `staging` environment.

### 2f. Deploy staging
1. Repository > **Actions** > **Build and deploy KAIRO** > **Run workflow**.
2. Select **`main`** and set **target** to `staging`. Manual staging deployments must be dispatched from `main`; merge and review changes there first. Feature branches cannot deploy directly.
3. When it finishes, open the run's **Summary**. It shows the staging URL and the `/api/ready` response.

The optional `STAGING_DEPLOY_ENABLED=true` repository variable controls automatic staging deployments on pushes to `main`. For a manual staging deployment, dispatch the workflow from `main` with target `staging`; do not dispatch from a feature branch.

If the deploy log says the account needs a **workers.dev subdomain**, register one: dashboard > **Workers & Pages** > the subdomain setting. Then re-run.

## 3. What "staging works" means
Open these in a browser (replace the host with your staging URL):

| URL | Expect |
|---|---|
| `/api/health` | The handler returns JSON with `"success":true`; requests from unauthenticated clients are intercepted by Cloudflare Access unless an exact public path override is configured. |
| `/api/ready` | The handler checks D1/schema and returns success or 503; requests from unauthenticated clients are intercepted by Cloudflare Access unless an exact public path override is configured. In live catalogue mode readiness checks D1 because account, library and watch-history routes depend on it. |
| `/api/v1/providers` | The configured live catalogue providers, independent episode providers, attribution details and artwork provider. In live mode MAL is the sole Anime catalogue provider when MAL_CLIENT_ID is configured; episode and artwork providers are reported separately. |
| `/` | The site loads and displays results from the configured live catalogue providers. The catalogue is not expected to be empty in live mode once MAL_CLIENT_ID is configured; without it the catalogue intentionally fails closed. |

`/api/ready` returns 503 if D1 is unreachable, if any required migration table is missing, or if the extended `user_profiles` account columns are unavailable. It does not call external catalogue providers, so the readiness probe does not consume their rate limits. With `ACCESS_ENFORCED=true`, the Worker intentionally returns only a generic ready status; if Cloudflare Access protects the path at the edge, unauthenticated deployment probes receive an Access login redirect instead. CI tests exercise the handler and readiness schema checks using test bindings, but that is not a substitute for a live D1 response. The deploy summary distinguishes this case rather than presenting a redirect as a successful database probe.

## 4. Environment variables and bindings

| Name | Kind | Where set | Purpose |
|---|---|---|---|
| `DB` | D1 binding | `wrangler.jsonc` per environment | Catalogue (DB mode) and account, library, session and watch-history data (all modes) |
| `METADATA_CACHE` | KV binding | `wrangler.jsonc` per environment | Short-lived provider response cache (needed on workers.dev) |
| `APP_ENV` | var | `wrangler.jsonc` | `development`, `staging`, `production` |
| `APP_BASE_URL` | Worker variable | `wrangler.jsonc` per environment | Canonical public origin used to construct OAuth callback and return URLs |
| `ACCESS_ENFORCED` | Worker variable | `wrangler.jsonc` per environment | Must be `true` for staging and production; Worker API routes fail closed without a valid Access identity |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | Worker variables | `wrangler.jsonc` per environment | Exact Cloudflare Access team issuer and application audience. Staging and production use their own app settings; both are checked by the deploy workflow before deployment |
| `GOOGLE_CLIENT_ID` | Worker variable | `wrangler.jsonc` per environment | OAuth client used only for administrator-only YouTube authorization |
| `METADATA_PROVIDERS` | var | `wrangler.jsonc` | Legacy D1 metadata enrichment providers. Blank by default; Kitsu is off pending terms review. Live Anime uses MAL_CLIENT_ID separately |
| `ALLOWED_ORIGIN` | var, optional | not set | Only for cross-origin API use |
| `GOOGLE_CLIENT_SECRET` | Worker secret | Cloudflare Worker environment | Required for the administrator's YouTube OAuth connection |
| `YOUTUBE_TOKEN_ENCRYPTION_KEY` | Worker secret | Cloudflare Worker environment | Required for YouTube token encryption; 32 random bytes, unpadded base64url |
| `YOUTUBE_DATA_API_KEY` | Worker secret | Cloudflare Worker environment | Required for administrator-only YouTube video/channel search, uploads and watch metadata; restrict to YouTube Data API v3 |
| `MAL_CLIENT_ID` | Worker secret | Cloudflare Worker environment | Required for live Anime metadata requests. Register a Kairo app at https://myanimelist.net/apiconfig; never expose it to the browser |
| `TMDB_ACCESS_TOKEN` | Worker secret | Cloudflare Worker environment | Required for TMDB Movies discovery/search/details where `MOVIES_TMDB_ENABLED=true`; also required for Anime poster/backdrop/episode-still artwork |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub environment **secrets** | GitHub only | Deploying. Never in the repo or the Worker |
| `STAGING_DEPLOY_ENABLED` | GitHub variable | GitHub | Auto-deploy staging on merge to main |
| `STAGING_URL`, `PRODUCTION_URL` | GitHub variables, optional | GitHub | Environment-specific fallback URL if the deploy log URL cannot be read; a production check never falls back to the staging URL |
| `KAIRO_REMOTE_HEALTH_CHECKS_ENABLED` | GitHub environment variable | **Settings > Environments > `staging` (and separately `production`) > Environment variables** | Set to `true` only after the exact `/api/health` and `/api/ready` Worker-destination overrides are saved and verified. The deploy job reads this from its target environment and fails closed before remote D1 work when it is absent or not `true`. Keep staging and production values separate. |
| `PRODUCTION_DEPLOY_APPROVED` | GitHub variable | GitHub | Must be `true` for any production deploy. **Do not set.** |

CineSrc is embedded directly by the Movies watch page and requires no Kairo Worker secret or additional Cloudflare binding. Movie playback is not routed through a Worker proxy.

Kairo user sign-in is handled by Cloudflare Access. Configure the Kairo application's Allow policy with exact individual email addresses only; do not use Everyone or a whole-domain rule. A verified Access email automatically resolves or provisions the Kairo profile, and `GET /api/v1/me` creates the internal HttpOnly Kairo session. No Kairo username/password is needed. Keep `ACCESS_ENFORCED=true`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` correct in each protected environment. In local development only, `ACCESS_ENFORCED` may be omitted/false so account state resolves to guest mode.

Set `GOOGLE_CLIENT_SECRET` and `YOUTUBE_TOKEN_ENCRYPTION_KEY` in Cloudflare's staging Worker **Secrets** before testing the administrator-only YouTube connection. Keep `APP_BASE_URL` and `GOOGLE_CLIENT_ID` in the staging Worker variables. Generate the YouTube encryption key from 32 cryptographically random bytes and encode it as unpadded base64url. Do not put Worker secrets in GitHub Actions logs or source control. For the Kairo administrator-only YouTube feed, also add `YOUTUBE_DATA_API_KEY` as a **staging Worker secret**. Create the key in the Google Cloud project with YouTube Data API v3 enabled, restrict the key to YouTube Data API v3, and keep it server-side; this Worker calls Google from the server, so browser HTTP-referrer restrictions are not applicable. Never store the key in `wrangler.jsonc`, GitHub, or client-side code. The YouTube feed is available only to the Kairo administrator; OAuth is a separate Google authorization for YouTube, not another Kairo sign-in step.

Password hashing and username credentials are not part of the Access-native Kairo sign-in path. Legacy credential tables are retained for migration compatibility, but first-visit profile provisioning does not create a password credential and the old login endpoint returns `410 ACCESS_SIGN_IN_ONLY`.

Playback position is written locally at most once per second and synced to the signed-in account's D1 history row every 15 seconds while playing, plus on play, pause, seek, end and page exit. Guests stay local-only. A cross-origin iframe does not expose its playhead to Kairo unless its player API supports it, so remote resume tracking is limited to Kairo-controlled HLS/file playback.

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
| Deploy job fails with `Deployment is blocked until exact public Worker destination overrides...` | Add the exact `/api/health` and `/api/ready` overrides to the target Worker's Cloudflare Access destination, verify both unauthenticated GETs return HTTP 200 JSON with `success: true`, then set `KAIRO_REMOTE_HEALTH_CHECKS_ENABLED=true` in that deployment's GitHub Actions environment. The guard runs before D1 backup, migrations and Worker deployment. |

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
- Confirm the staging Worker secrets `GOOGLE_CLIENT_SECRET` and `YOUTUBE_TOKEN_ENCRYPTION_KEY` exist. Cloudflare does not expose secret values for read-back; verify by running a controlled administrator-only YouTube connection test after deployment.
- Confirm the exact YouTube and Google callback URLs are registered in the Google OAuth client.
- Configure and verify MAL_CLIENT_ID before deploying the live Anime catalogue. Confirm /api/ready reports providers: ["mal"], and separately verify Jikan/HiAnime episode discovery. Configure TMDB_ACCESS_TOKEN for Anime artwork; without it MAL metadata can load but poster/backdrop slots will be empty. The staging deploy's `cache: "kv"` proves the binding is present, not that every KV read/write path has been exercised.
- Migration `0007_youtube_oauth.sql` remains pending on staging until a reviewed staging deployment applies it. Production remains blocked and untouched.

## 8. Production (blocked)
Production deploys are blocked by design until you approve. They need all of: a separate D1 database and KV namespace, their IDs in the `production` block, a separate token in the `production` environment, a separately configured production Cloudflare Access application with its own team domain and AUD tag, `ACCESS_ENFORCED=true`, the variable `PRODUCTION_DEPLOY_APPROVED=true`, a run from `main`, and your approval as required reviewer. The committed production Access values are placeholders, and the workflow refuses to deploy while either placeholder remains or enforcement is not `true`. Do not put production Access values or credentials in the staging configuration. Do none of this until staging is proven with a real catalogue.

### Approved playback host allowlist

The HiAnime playback resolver is fail-closed. The staging Wrangler configuration currently allows these exact HTTPS hosts: `zokoanime.video`, `megaplay.buzz`, `hls.dramahot.top`, `hls1.drama1.cfd`, `mysubsplay.com`, `emeralddrift.world`, and `hianime.at`. Local development remains empty and production remains unchanged. The variant domains `hls1drama1.cfd`, `mysubplay.com`, and `emeralddrift.com` were removed pending explicit ownership and provider-permission verification. Confirm that every remaining host is covered by the relevant provider's playback permissions before deploying. Add only exact approved hostnames (comma-separated); `*.example.com` matches subdomains only. Do not add broad wildcard domains. The Worker still rejects HTTP URLs, credentials, nonstandard ports, expired URLs, and hosts outside this list.
