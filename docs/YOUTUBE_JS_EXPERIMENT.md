# YouTube.js discovery experiment

This document describes the isolated implementation on the `youtube.js` branch. It is not a change to Kairo's production YouTube-provider decision.

## Architecture

- `services/youtubejs-gateway` is a separate Cloudflare Worker using the `youtubei.js/cf-worker` entrypoint.
- The gateway supports anonymous public video search only.
- `worker/youtube/innertube.ts` is a same-origin Kairo proxy. It is disabled unless explicitly enabled in development or staging and refuses production requests regardless of configuration.
- Guest Home discovery tries the experimental endpoint first. A disabled, missing or unavailable gateway falls back to Kairo's existing official YouTube Data API search route.
- Signed-in recommendation candidates, channel management, watch metadata, watch history, and playback are unchanged. The existing privacy-enhanced YouTube iframe remains the only Kairo YouTube playback surface.

## Security boundaries

- No browser cookies, YouTube OAuth, account credentials or copied session tokens are accepted or forwarded.
- The gateway requires a server-side bearer secret. Kairo stores the matching value in a Worker secret and never sends it to the browser.
- Kairo applies a D1 IP rate limit and validates gateway results before returning them.
- The gateway's InnerTube session is anonymous and uses a process-local cache adapter.
- No video bytes are downloaded, extracted, proxied or transformed.

## Important limitations

YouTube.js is an unofficial client for YouTube's undocumented InnerTube API. YouTube can change or restrict that interface without notice. The experiment is therefore best-effort and may intermittently fail. Its MIT software licence does not grant rights to YouTube content or supersede YouTube's terms and policies. Review applicable terms and legal requirements before operating the gateway.

YouTube.js search is used instead of a trending endpoint; the project does not assume that a dedicated trending feed is available. The official Data API remains Kairo's supported discovery provider and fallback.

## Enablement

See [services/youtubejs-gateway/README.md](../services/youtubejs-gateway/README.md) for local and staging setup. There is deliberately no production gateway Wrangler environment and no production enablement path in the Kairo proxy.
