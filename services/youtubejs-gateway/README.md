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
npx wrangler dev --config wrangler.jsonc
```

Set a local secret in a git-ignored `.dev.vars` file:

```text
GATEWAY_SECRET=replace-with-a-long-random-value
```

Set `APP_ENV=development` in local vars (already configured in the checked-in Wrangler file).

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
