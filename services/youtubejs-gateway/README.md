# Kairo YouTube.js gateway (experimental)

This is a separate Cloudflare Worker used only for an isolated discovery experiment. It is not part of Kairo's production YouTube provider.

## Scope

- Anonymous, public video search only.
- No YouTube cookies, OAuth credentials, copied session tokens or account-linked requests.
- No watch-history, subscription-feed, comments, channel-sync or playback-stream endpoints.
- No stream URL extraction, downloading, proxying or player replacement.
- Kairo continues using the official YouTube iframe for playback and the official YouTube Data API as the normal discovery provider and fallback.

YouTube.js speaks YouTube's undocumented InnerTube interface. It can stop working when YouTube changes that interface and may be restricted by YouTube. The library's MIT licence does not grant permission to access YouTube content or override YouTube's terms. Do not enable this gateway in production.

## Local development

Node.js 22 and npm are required.

```bash
cd services/youtubejs-gateway
npm install
npm run typecheck
npx wrangler dev --config wrangler.jsonc
```

Set a local secret in a git-ignored `.dev.vars` file:

```text
APP_ENV=development
GATEWAY_SECRET=replace-with-a-long-random-value
```

Local `.dev.vars` sets `APP_ENV=development`; the checked-in Wrangler default is deliberately disabled so an accidental non-staging deploy cannot serve searches.

## Staging setup

1. Install dependencies in this directory and deploy only the staging environment:

   ```bash
   cd services/youtubejs-gateway
   npm install
   npx wrangler secret put GATEWAY_SECRET --env staging
   npm run deploy:staging
   ```

2. Configure the Kairo staging Worker with these values:
   - `YOUTUBE_JS_EXPERIMENT_ENABLED=true`
   - `YOUTUBE_JS_GATEWAY_URL=https://kairo-youtubejs-gateway-staging.<your-workers-subdomain>.workers.dev`
   - `YOUTUBE_JS_GATEWAY_TOKEN`: the same secret value as the gateway's `GATEWAY_SECRET`

   Keep the token in Worker secrets. Do not put it in `wrangler.jsonc`, GitHub, browser code or chat. The gateway hostname is illustrative; use the deployed hostname shown by Wrangler.

3. Test guest discovery and confirm the Kairo Worker logs do not contain the gateway token.

The Kairo proxy refuses this provider outside development and staging even when its enable flag is set. The gateway itself returns 404 outside those environments. No production Wrangler environment is configured here.

## Runtime notes

The gateway uses the package's `youtubei.js/cf-worker` entrypoint and an in-memory cache adapter. Cloudflare's Cache API does not accept the arbitrary cache keys used by the library's default universal cache adapter. The process-local cache is intentionally ephemeral; the library session is generated locally per request.

The package version is pinned exactly in `package.json`. Run `npm install` in this service directory to generate/update its local lockfile before deploying from a clean checkout.

## GitHub Actions verification and staging deployment

The `YouTube.js verification and staging` workflow runs on pushes to the `youtube.js` branch and on pull requests targeting `main`. It:

1. Runs the Kairo proxy tests and typecheck.
2. Typechecks and dry-runs the isolated gateway build.
3. Starts a local gateway in the GitHub runner and makes live anonymous YouTube.js searches for astronomy, lofi music, and TypeScript tutorials.
4. Validates returned video IDs, titles, canonical watch URLs, duplicate IDs, and thumbnail hosts.
5. Uploads a JSON smoke-test report and includes the result summary in the Actions run.

After all verification steps pass, pushes to `youtube.js` also deploy the gateway and Kairo Worker to **staging only**. The workflow never deploys a production environment. It then checks the deployed gateway and Kairo proxy and makes one official Data API search for `astronomy` as a reference comparison. That reference request consumes normal YouTube Data API quota; it is deliberately limited to one query per staging deployment. The report records top-five titles and shared video IDs, but human review is still needed to judge relevance.

The deployment job is attached to the existing GitHub Actions environment named `staging`, matching Kairo's normal deploy workflow. It uses the environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. It generates a fresh random gateway bearer secret at deploy time and writes that secret directly to the two staging Workers; the shared token is masked in Actions logs and is not stored in GitHub or source control.

When either Cloudflare environment secret is missing, the workflow reports that staging deployment was skipped instead of attempting a partial deploy. The workflow derives the gateway workers.dev URL from the configured Kairo staging hostname. Do not add credentials to source files or commit local `.dev.vars` files.

A manual `workflow_dispatch` is also available on this branch. Its `deploy_staging` input must be enabled to request a staging deployment; the same verification and secrets checks still apply.
