# Kairo YouTube feed prototype

A browser-accessible, staging-only experiment that sends a manually supplied YouTube cookie header to a gated Kairo Worker endpoint. It uses YouTube.js 18.3.0 to test the signed-in subscriptions feed and pagination.

> **Unofficial integration warning:** YouTube.js communicates with YouTube's undocumented InnerTube interface. It is not supported or endorsed by YouTube, may stop working, and may conflict with YouTube's API/developer policies. This is an isolated technical experiment, not a production integration. Do not use it to bypass playback restrictions or extract video streams.

## Open the browser tool

After the staging Worker has been deployed with the required secret, open:

`https://YOUR-KAIRO-STAGING-HOST/youtube-feed-lab.html`

No terminal or local Node.js installation is needed to use the page.

## One-time staging setup

1. In Cloudflare, open the Kairo **staging Worker** settings.
2. Under **Settings → Variables and Secrets**, add a secret named `YOUTUBE_STAGING_TOKEN`. Generate a long, random value and keep it private.
3. Ensure the staging Worker has `APP_ENV=staging` and that its compatibility date is `2026-08-04` or later. This repo currently uses `2026-11-04`, which enables Cloudflare's Node.js compatibility APIs by default.
4. In GitHub Actions, run **Generate package-lock.json** once so the new pinned `youtubei.js` dependency is reflected in the lockfile.
5. Deploy the `youtube` branch to the staging environment only.

The endpoint refuses requests outside `APP_ENV=staging`, requires the bearer token, and checks that requests originate from the same staging origin.

## Run a feed test

1. Use a separate YouTube test account, not your personal account.
2. Sign in to YouTube in a private/incognito browser window.
3. Open DevTools → Network, reload YouTube, select a request to `youtube.com`, and copy its complete `Cookie` request header.
4. Open the Kairo staging page above.
5. Enter the staging token and paste the Cookie header. Choose one to three feed pages and submit.

The page clears the cookie field after the request. The Worker processes the cookie in memory for that request only; it does not write the cookie or feed to D1/KV and the endpoint does not log request bodies or upstream errors. Do not use the page on a public/shared device or an untrusted staging host. Revoke the test account session if you suspect exposure.

## What the endpoint returns

Normalized video IDs, titles, channel names, publication labels, durations, live flags, thumbnails, and standard YouTube watch/embed URLs. It does not download media or extract stream URLs.

## Known limitations

- YouTube may require verification or reject a copied/rotated cookie.
- YouTube may block Cloudflare datacenter IPs. A successful local test does not imply staging will work, and vice versa.
- This uses an undocumented/private interface and is not approved for production use.
- The browser cannot read YouTube's HttpOnly cookies automatically. The user must manually copy the Cookie request header into the staging page.
- The bearer token is a staging gate, not a full user-account system. Keep the staging host restricted and rotate the token if exposed.

## API used

- `Innertube.create({ cookie, enable_session_cache: false })`
- `innertube.getSubscriptionsFeed()`
- `feed.videos`
- `feed.has_continuation`
- `feed.getContinuation()`

References: [YouTube.js repository](https://github.com/LuanRT/YouTube.js), [authentication guide](https://ytjs.dev/guide/authentication), [getting started](https://ytjs.dev/guide/getting-started).
