# YouTube provider — implementation plan

## Product intent

Add YouTube as a first-class provider inside Kairo, reachable from the existing Media provider menu. Keep Kairo's dark visual theme, but make the YouTube section familiar to YouTube users: compact left navigation, top search, channel/video rows and a familiar video watch layout. This is a provider-specific experience; do not redesign the anime catalogue or global shell.

## Research and constraints (checked 2026-11-10)

- Use the official YouTube Data API v3 for public channel/video metadata and uploads playlists.
- Resolve a channel's uploads playlist through the channel resource, then page playlistItems.list; this costs 1 quota unit per request. Avoid search.list for routine refreshes because its quota cost is much higher.
- Use the official YouTube IFrame Player API for playback. The player must remain recognizably YouTube-owned; Kairo may provide its surrounding dark interface but must not hide/alter player functionality, ads or attribution.
- Production integration must not use InnerTube, undocumented endpoints, scraping, browser cookies, copied session tokens, or collect YouTube login credentials. YouTube's policies explicitly prohibit undocumented API use and scraping, and instruct API clients not to request/store YouTube credentials.
- An isolated staging-only experiment exists at `experiments/youtube-feed-prototype/` and `public/youtube-feed-lab.html`. It sends a manually supplied YouTube Cookie header to a bearer-token-gated Hono Worker endpoint, uses YouTube.js 18.3.0 for the signed-in subscriptions feed, disables session caching, and returns normalized metadata only. It is unofficial, may violate YouTube's developer policies, must never be enabled in production, and must not persist or log cookies. A successful prototype does not authorize shipping this approach.
- Public video embeds do not require the viewer to sign in. OAuth is not required for the initial public-channel feed. If later needed, use Google's documented OAuth consent flow only for a clearly defined authorized feature.
- Respect videos with embedding disabled, private/deleted videos, region restrictions, API errors and player error 153. Always retain a Watch on YouTube fallback.
- Do not proxy video bytes, extract stream URLs, or try to bypass playback restrictions.

## Proposed architecture

1. YouTube is an independent provider route/page, not a replacement for anime metadata or playback providers.
2. Frontend calls same-origin Kairo API only; no API key in browser bundles.
3. Worker adapter uses a YOUTUBE_API_KEY secret, validates channel IDs/handles, fetches channel uploads playlist and paginates recent uploads.
4. Normalize to a small internal YouTubeVideo shape: videoId, title, description, thumbnail, channelId, channelTitle, publishedAt, duration (when available), live status.
5. Cache public feed metadata only if permitted by current YouTube API policies; track fetchedAt and avoid retaining stale data beyond the applicable policy window. Refresh cadence configurable, default six hours.
6. Embed selected video using official IFrame Player API with a valid page origin/referrer. Handle errors and provide an external YouTube link.
7. Initial UX: dark-first YouTube-inspired layout, channel feed list/grid, channel filter, chronological sorting, 30-day default window, explicit loading/empty/error states. No autoplay, infinite recommendation feed, or algorithmic Up next rabbit hole.

## Delivery phases

- Phase 1: provider page + route/menu integration, public channel feed API, embed playback, validation/tests.
- Phase 2: channel management UI and persistence (D1), refresh schedule/configuration, pagination and caching.
- Phase 3: optional Google OAuth only if a feature truly needs private/user-owned data. Never ask for or store YouTube passwords/cookies.
- Experimental gate: evaluate the staging-only YouTube.js prototype separately. Its endpoint is disabled unless APP_ENV=staging and YOUTUBE_STAGING_TOKEN is configured. Do not promote it into production without resolving policy, security, and operational risks.

## Configuration / blockers

- Add YOUTUBE_API_KEY as a Cloudflare Worker secret (never commit it).
- For the staging experiment only, configure YOUTUBE_STAGING_TOKEN as a Cloudflare Worker secret and keep the staging host restricted. The endpoint is not a production feature.
- The first implementation should support public channel IDs/handles. Channel discovery by arbitrary text can be a separate, quota-aware search action.

## Primary references

- YouTube API directory: https://developers.google.com/youtube/apis
- Data API getting started and quota: https://developers.google.com/youtube/v3/getting-started
- Playlist items list: https://developers.google.com/youtube/v3/docs/playlistItems/list
- IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- Developer policies: https://developers.google.com/youtube/terms/developer-policies
