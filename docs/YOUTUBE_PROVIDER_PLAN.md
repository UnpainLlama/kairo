# YouTube provider — implementation plan

## Product goal and scope

Make YouTube a first-class Kairo provider, reachable from the Media provider menu, with a familiar dark-first experience while keeping it isolated from the anime catalogue and global shell.

The intended experience has two distinct entry points:
- A public discovery feed that works without connecting an account.
- An optional subscriptions feed for users who explicitly connect YouTube to their signed-in Kairo account.

Search, channel pages, video rows/cards, and a watch view should use official YouTube services. Kairo may add independent value through saved videos, personal organisation, and cross-provider navigation. Do not claim to reproduce the exact personalised YouTube Home recommendations feed: the documented Data API does not expose it.

This plan describes the full provider roadmap. The current account-foundation work implements the explicit YouTube connection/security foundation only; it does not claim that subscriptions sync or public feeds are already shipped.

## Product, policy and playback boundaries

- Use the official YouTube Data API v3 for public channel/video metadata, uploads playlists, and authorized subscription data.
- Resolve a channel's uploads playlist through the channel resource, then page `playlistItems.list`. Avoid routine `search.list` calls because their quota cost is substantially higher.
- Use Google's documented OAuth authorization-code flow with PKCE for optional YouTube access. Request only `https://www.googleapis.com/auth/youtube.readonly` for the initial connection.
- Kairo Google sign-in is a separate identity flow and must continue to request only `openid email profile`. Connecting YouTube must never silently expand sign-in scopes.
- Never request or store YouTube passwords, browser cookies, copied session tokens, or undocumented InnerTube endpoints. Do not scrape.
- Store OAuth access/refresh tokens only on the Worker side, encrypted at rest with a dedicated key. Never return tokens to the browser or write them to logs.
- Bind a YouTube connection to the authenticated Kairo user. Do not auto-link accounts by matching email addresses.
- Public video embeds do not require the viewer to sign in. Public discovery must remain usable when YouTube is disconnected. Clearly distinguish Kairo discovery from a user's subscriptions and from YouTube Home.
- Preserve YouTube player branding, ads, controls and attribution. Respect videos with embedding disabled, private/deleted videos, regional restrictions, API errors and player error 153. Always retain a Watch on YouTube fallback.
- Do not proxy video bytes, extract stream URLs, or bypass playback restrictions.
- Respect API quota, pagination, caching/retention/deletion requirements, and applicable YouTube API policies. Track fetch times and do not retain API data longer than policy permits.
- The staging-only YouTube.js/cookie experiment in `experiments/youtube-feed-prototype/` and `public/youtube-feed-lab.html` is unofficial, may violate YouTube developer policies, and is not part of the production architecture. It must not be promoted, enabled in production, or used as justification for shipping cookie-based access.

## Proposed architecture

1. YouTube is an independent provider route/page, not a replacement for anime metadata or playback providers.
2. The frontend calls the same-origin Kairo API only; no YouTube API key or OAuth client secret belongs in browser bundles.
3. Public API operations use a Worker-side `YOUTUBE_API_KEY` secret. Validate channel IDs/handles and use quota-aware documented endpoints.
4. The authenticated YouTube connection has separate connect, callback, status, disconnect and (later) sync behavior. Do not reuse the sign-in-only callback as an API-token store.
5. Persist per-user connection metadata and encrypted credentials in D1. Keep encryption key material in Worker secrets, not D1 or source control.
6. Normalize feed items to a small internal `YouTubeVideo` shape: `videoId`, `title`, `description`, `thumbnail`, `channelId`, `channelTitle`, `publishedAt`, `duration` (when available), live status, and source/feed context.
7. Public discovery uses documented public discovery/trending/search surfaces where available and useful, plus public channel uploads. Keep it functional for guests and distinguish Kairo-curated/popular discovery from subscriptions.
8. The subscriptions feed uses the authenticated user's documented subscriptions endpoint (for example, `subscriptions.list(mine=true)`) and retrieves recent uploads from those channels using quota-aware playlist/video calls. The API does not provide the exact personalised Home feed.
9. Sync incrementally with pagination and a bounded per-user channel/video budget. Store cursors/timestamps and metadata only as permitted by YouTube policy. Provide manual refresh and configurable background refresh with backoff and quota budgeting; do not poll on every request.
10. Embed selected videos using the official IFrame Player API with a valid page origin/referrer. Handle player errors and provide an external YouTube link.
11. Keep public browsing available when a user is disconnected or YouTube is unavailable. Keep Kairo library/history separate from YouTube watch history unless a future, explicitly scoped API feature supports it.

## Delivery phases and acceptance criteria

### Phase 0 — configuration and design verification

- Verify OAuth client, environment-specific redirect URIs, consent screen and requested scope.
- Verify YouTube Data API v3 is enabled and quota is understood.
- Verify Worker secrets exist in the intended environments without printing or exposing their values.
- Confirm current YouTube API policy requirements and retention obligations.
- Document the source and limitations of the general discovery feed.

### Phase 1 — explicit YouTube connection and secure OAuth foundation

- Add a clearly labelled **Connect YouTube** action to signed-in Kairo Settings, separate from Connect Google.
- Require an authenticated Kairo session and a recent-session check before starting the connection.
- Implement a separate authorization-code flow with state, PKCE S256, a short-lived one-time transaction, and binding to both the Kairo user and initiating session.
- Request only the YouTube read-only scope and offline access needed for refresh capability. Ordinary Kairo Google sign-in remains identity-only.
- Encrypt access/refresh tokens in the Worker using a dedicated `YOUTUBE_TOKEN_ENCRYPTION_KEY`; persist the connection in the existing `provider_connections` table.
- Build the callback URI from canonical `APP_BASE_URL`, never from the incoming Host header.
- Add connection status, safe callback outcomes, reconnect behavior, and disconnect/revoke handling.
- Add the D1 migration for one-time OAuth transactions. Document the secret and redirect URI setup. Do not apply remote migrations or deploy as part of code implementation.
- Acceptance: a signed-in user can explicitly connect and see connected status; another Kairo user cannot claim that connection; no token reaches the browser; ordinary Google sign-in is unchanged.

### Phase 2 — authorized subscriptions sync

- Use the authorized token to call YouTube Data API `subscriptions.list` with `mine=true`.
- Implement token refresh, pagination, quota-aware retries/backoff, deduplication, and idempotent persistence of channel IDs and required metadata.
- Add a manual sync action and useful sync timestamps/status.
- Handle revoked authorization and refresh failures with a clear reconnect path.
- Acceptance: a connected user can sync and view subscribed channels; repeated syncs do not duplicate rows and API failures do not corrupt the last good result.

### Phase 3 — public discovery and subscriptions feeds

- Build a public discovery feed that works without a connected account.
- Build a separate subscriptions feed from the user's synchronized channel data.
- Fetch public channel uploads through the documented API, resolve uploads playlists, and paginate efficiently; avoid routine high-cost search requests.
- Add channel/video cards, channel details, sorting/filtering, loading/empty/error states, and official embedded playback with an external Watch on YouTube fallback.
- Acceptance: visitors can use public discovery without OAuth; connected users can switch to their subscriptions feed; playback respects YouTube's player requirements.

### Phase 4 — automation, resilience and account controls

- Add scheduled/background refresh for subscriptions and channel uploads with configurable cadence (a six-hour default may be evaluated against quota and policy limits).
- Handle expired/revoked grants, deleted/private channels, quota exhaustion, transient API errors, and partial sync failures.
- Complete disconnect and data deletion behavior, including token revocation where supported and removal of Kairo-held provider data.
- Add privacy-conscious operational logging and monitoring; never log credentials or tokens.
- Acceptance: sync recovers safely from transient failures, users can disconnect cleanly, and stale/invalid connections are clearly identified.

### Phase 5 — hardening, release readiness and launch

- Complete responsive UI, accessibility, and user-facing guidance for connecting/reconnecting.
- Add automated tests for OAuth state/session binding, PKCE, token encryption, token refresh, subscription pagination, persistence, quota/error handling, feed behavior, and account isolation.
- Review YouTube API policy compliance, API console configuration, OAuth consent settings, exact redirect URIs, Worker secrets, D1 migration order, and production environment configuration.
- Run typecheck, tests and production build; inspect the final diff and resolve blockers before proposing release.
- Prepare a staged rollout and rollback procedure. No deployment or remote migration occurs without explicit approval.

## Configuration inventory

- Configure `GOOGLE_CLIENT_ID` as a Worker variable and `GOOGLE_CLIENT_SECRET` as a Worker secret for each environment.
- Add `YOUTUBE_TOKEN_ENCRYPTION_KEY` as a Worker secret; generate a cryptographically random 32-byte key, encode it as unpadded base64url, and keep it out of source control. Never paste the secret into chat.
- Keep `APP_BASE_URL` canonical for each environment. The staging callback is `https://kairo-anime-platform-staging.unpainllama.workers.dev/api/v1/auth/youtube/callback`; register the exact callback URI for every configured environment in Google Cloud Console. Keep the separate Google sign-in callback registered too.
- Enable YouTube Data API v3 in the associated Google Cloud project.
- Public API access will require a Worker-side `YOUTUBE_API_KEY` secret if/when the public feed adapter is implemented.
- Apply D1 migrations to each environment only after review and explicit release approval.
- For the staging experiment only, any existing `YOUTUBE_STAGING_TOKEN` remains a secret and its endpoint remains restricted to staging. It is not a production feature.

## Primary references

- YouTube API directory: https://developers.google.com/youtube/apis
- YouTube Data API getting started and quota: https://developers.google.com/youtube/v3/getting-started
- Playlist items list: https://developers.google.com/youtube/v3/docs/playlistItems/list
- Subscriptions list: https://developers.google.com/youtube/v3/docs/subscriptions/list
- YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- Google OAuth 2.0 for web server applications: https://developers.google.com/identity/protocols/oauth2/web-server
- YouTube developer policies: https://developers.google.com/youtube/terms/developer-policies
