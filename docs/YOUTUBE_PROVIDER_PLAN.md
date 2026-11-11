# YouTube provider — implementation plan

## Product intent

Add YouTube as a first-class provider inside Kairo, reachable from the existing Media provider menu. Keep Kairo's dark visual theme, but make the YouTube section familiar to YouTube users: compact left navigation, top search, channel/video rows and a familiar video watch layout. This is a provider-specific experience; do not redesign the anime catalogue or global shell.

The home experience should combine:
- A general discovery feed that works without connecting an account.
- A subscriptions feed for users who explicitly connect their Google/YouTube account.
- Search, channel pages and a watch view using official YouTube playback.
- Kairo-owned value such as saved videos, personal organisation and cross-provider navigation.

Do not claim to reproduce the exact personalised YouTube Home recommendation feed: the documented YouTube Data API does not expose that feed.

## Research, policy and playback constraints

- Use the official YouTube Data API v3 for public channel/video metadata, uploads playlists, subscriptions and supported discovery endpoints.
- Resolve a channel's uploads playlist through the channel resource, then page playlistItems.list. Avoid search.list for routine refreshes because its quota cost is much higher.
- Use the official YouTube IFrame Player API for playback. The player must remain recognizably YouTube-owned; Kairo must not hide/alter player functionality, ads or attribution.
- Production integration must not use InnerTube, undocumented endpoints, scraping, browser cookies, copied session tokens, or collect YouTube login credentials.
- An isolated staging-only experiment exists at `experiments/youtube-feed-prototype/` and `public/youtube-feed-lab.html`. It uses an unofficial cookie-based YouTube.js approach. It may violate YouTube developer policies, must never be enabled in production, and must not persist or log cookies. A successful prototype does not authorize shipping this approach.
- Respect videos with embedding disabled, private/deleted videos, region restrictions, API errors and player error 153. Always retain a Watch on YouTube fallback.
- Do not proxy video bytes, extract stream URLs, or try to bypass playback restrictions.
- Follow current YouTube API Services Terms, Developer Policies and data-retention/deletion requirements. Re-fetch or delete stored API data as required by policy; record the applicable policy review before release.
- Design Kairo's discovery feed to provide meaningful independent value rather than simply cloning YouTube's core experience.

## Google account connection: separate from Kairo sign-in

Kairo already has Google OpenID Connect sign-in/linking in the account foundation. That existing flow currently requests only `openid email profile`, validates the ID token, and intentionally does not persist Google API access or refresh tokens. Do not broaden ordinary Kairo sign-in to silently grant YouTube access.

Implement a separate, explicit **Connect YouTube** action in account settings:
1. Require an authenticated Kairo session and explain what connecting YouTube enables.
2. Start a separate Google authorization-code flow using state, nonce and PKCE, linked to the current Kairo user. Do not treat an ID token from normal sign-in as YouTube API authorisation.
3. Request the minimum read-only YouTube scope needed for the agreed features (initially `https://www.googleapis.com/auth/youtube.readonly`). Ask only for scopes actually used.
4. Request offline access where needed for background refresh. Handle consent/refresh-token issuance correctly, including reconnect/re-consent when Google does not return a new refresh token.
5. Validate the callback, issuer, audience, state, nonce and token response; defend against CSRF, account mix-ups and linking a Google identity already connected to another Kairo account.
6. Keep access/refresh tokens on the Worker side. Encrypt refresh tokens at rest with an application-managed encryption key stored as a Worker secret; never put tokens in browser storage, URLs, logs, analytics or client responses. Store only the minimum metadata needed to manage the connection.
7. Add connection status, last successful sync, reconnect/error states and a **Disconnect YouTube** action. Disconnect must stop scheduled sync and delete stored credentials; explain how to revoke access at Google as well.
8. Handle expired/revoked tokens, invalid_grant, scope changes, user cancellation, quota errors and transient upstream failures without breaking ordinary Kairo sign-in.
9. Do not request or store YouTube passwords, browser cookies or session tokens.

The existing Google client may be reusable, but before implementation verify its OAuth consent configuration, authorised redirect URI(s), enabled YouTube Data API v3, scope configuration and environment-specific Worker secrets. A configured OAuth client alone does not prove YouTube scopes have been granted.

## Proposed architecture

1. YouTube is an independent provider route/page, not a replacement for anime metadata or playback providers.
2. Frontend calls same-origin Kairo API only; no API key or OAuth client secret in browser bundles.
3. Worker adapter uses a `YOUTUBE_API_KEY` secret for public API operations, validates channel IDs/handles and uses quota-aware endpoints.
4. Add a separate authenticated YouTube connection API for connect, callback, status, disconnect and sync. Never reuse the sign-in-only callback as a token vault.
5. Persist per-user connection metadata and encrypted refresh credentials in D1. Add migration(s), indexes, ownership checks and tests. Keep encryption key material in Worker secrets, not D1 or source control.
6. Normalize feed items to a small internal `YouTubeVideo` shape: videoId, title, description, thumbnail, channelId, channelTitle, publishedAt, duration (when available), live status and source/feed context.
7. Public discovery feed: use documented public discovery/trending/search surfaces where available and useful, plus public channel uploads. Keep it functional for guests. Clearly distinguish Kairo-curated/popular discovery from the user's subscriptions.
8. Subscriptions feed: use the authenticated user's documented subscriptions endpoint (for example `subscriptions.list` with `mine=true`) and retrieve recent uploads from those channels using quota-aware playlist/video calls. The API does not provide the exact personalised Home recommendations feed.
9. Sync incrementally with pagination and a bounded per-user channel/video budget. Store sync cursors/timestamps and per-user feed metadata only as permitted by YouTube policy. Avoid polling every request; provide manual refresh and a configurable background refresh cadence with backoff and quota budgeting.
10. Embed selected videos using the official IFrame Player API with a valid page origin/referrer. Handle player errors and provide an external YouTube link.
11. Initial UX: dark-first YouTube-inspired layout, general Home/discovery feed, opt-in Subscriptions feed, channel pages, search, chronological sorting, explicit loading/empty/error states, and a 30-day default display window where appropriate. No autoplay or infinite recommendation rabbit hole.
12. Keep public feed browsing available when YouTube is disconnected or unavailable. Keep Kairo library/history features separate from YouTube's own watch history unless a future, explicitly scoped API feature supports them.

## Delivery phases and acceptance criteria

### Phase 0 — configuration and design verification
- Verify OAuth client, redirect URIs for staging/production, consent screen and requested scope.
- Verify YouTube Data API v3 is enabled and quota is understood.
- Verify Worker secrets exist in the intended environments without printing or exposing their values.
- Confirm current YouTube API policy requirements and retention obligations.
- Document the general discovery feed source and its limitations.

### Phase 1 — public YouTube experience
- Provider page + route/menu integration.
- Public discovery/feed API through the Worker.
- Official IFrame playback and Watch on YouTube fallback.
- Loading, empty, error, quota and unavailable-video states.
- Input validation, quota-aware caching and automated tests.
- No account connection required for this phase.

### Phase 2 — connect account and subscriptions sync
- Separate Connect YouTube OAuth flow with minimum read-only scope.
- Encrypted refresh-token storage, account ownership checks and disconnect/revoke handling.
- Subscriptions list and recent channel uploads feed.
- Manual refresh, incremental sync, pagination, quota budgeting, backoff and policy-compliant data lifecycle.
- Tests for OAuth state/PKCE, callback validation, token refresh, revoked access, disconnect, cross-account isolation and API failures.

### Phase 3 — channel management and refinement
- Channel management UI and persistence where useful.
- Scheduled refresh configuration and observability without sensitive token logging.
- Search/channel discovery improvements and feed ranking only where supported by documented APIs and Kairo's independent product value.

### Experimental gate
Evaluate the staging-only YouTube.js prototype separately. Its endpoint must remain disabled outside the restricted staging environment and must not be promoted into production unless its policy, security and operational risks are independently resolved. The production plan does not depend on it.

## Configuration / blockers

- Configure `YOUTUBE_API_KEY` as a Cloudflare Worker secret (never commit it).
- Reuse the existing Google OAuth client only after verifying consent screen and redirect configuration; add YouTube read-only scope consent as a separate user-authorised flow.
- Configure a dedicated token-encryption key as a Worker secret; plan rotation and re-encryption.
- Confirm D1 migration and backup/rollback approach before adding connection/token tables.
- For the staging experiment only, `YOUTUBE_STAGING_TOKEN` remains a Worker secret and the endpoint remains non-production.
- First implementation should support documented public discovery and channel IDs/handles. Arbitrary text channel discovery should be a separate, quota-aware search action.

## Primary references

- YouTube API directory: https://developers.google.com/youtube/apis
- Data API getting started and quota: https://developers.google.com/youtube/v3/getting-started
- Playlist items list: https://developers.google.com/youtube/v3/docs/playlistItems/list
- Subscriptions list: https://developers.google.com/youtube/v3/docs/subscriptions/list
- IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- Developer policies: https://developers.google.com/youtube/terms/developer-policies
- Google OAuth 2.0 web server flow: https://developers.google.com/identity/protocols/oauth2/web-server
