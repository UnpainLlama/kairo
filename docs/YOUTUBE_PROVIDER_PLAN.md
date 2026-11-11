# YouTube provider — implementation plan

## Product goal

Make YouTube a first-class Kairo provider with a public discovery experience available to everyone and an optional, explicitly connected subscriptions experience for signed-in Kairo users. Keep this work isolated from the anime catalogue and existing Google sign-in behavior.

## Product and policy boundaries

- Use the official YouTube Data API v3 for public channel/video metadata and authorized subscription data.
- Use Google's documented OAuth authorization-code flow with PKCE for the optional YouTube connection. Request only `https://www.googleapis.com/auth/youtube.readonly`.
- Kairo Google sign-in remains a separate identity flow and continues to request only `openid email profile`. Connecting YouTube must never silently expand sign-in scopes.
- Never request or store YouTube passwords, browser cookies, copied session tokens, or undocumented InnerTube endpoints. Do not scrape.
- Store OAuth access/refresh tokens only in the Worker, encrypted at rest with a dedicated encryption key. Never return tokens to the browser or log them.
- Bind the YouTube connection to the currently authenticated Kairo user; do not auto-link accounts by matching email addresses.
- Public discovery must work without OAuth. A user's exact YouTube Home recommendations are not exposed by the public Data API; do not present a public discovery feed as a replica of Home.
- Use the official YouTube IFrame Player API for playback. Preserve YouTube player branding, ads, controls, and attribution; retain a Watch on YouTube fallback. Do not proxy video bytes, extract stream URLs, or bypass playback restrictions.
- Respect API quota, pagination, caching/retention rules, embedding restrictions, private/deleted videos, regional restrictions, and player errors.
- The staging-only YouTube.js/cookie prototype is not part of the production architecture and must not be promoted.

## Delivery phases

### Phase 1 — Explicit YouTube connection and secure OAuth foundation

- Add a clearly labelled **Connect YouTube** action to signed-in Kairo Settings, separate from Connect Google.
- Implement a separate Google OAuth authorization-code flow with state, PKCE, short-lived one-time transactions, and session/user binding.
- Request only the YouTube read-only scope and offline access for refresh capability.
- Encrypt tokens in the Worker using a dedicated `YOUTUBE_TOKEN_ENCRYPTION_KEY`; persist the connection in the existing `provider_connections` table.
- Add connection status, safe callback outcomes, reconnect behavior, and disconnect/revoke handling.
- Add the required D1 migration for one-time OAuth transactions. Document the secret and redirect URI setup. Do not apply remote migrations or deploy as part of code implementation.
- Acceptance: a signed-in user can explicitly connect and see connected status; a different Kairo user cannot claim the connection; no token reaches the browser; ordinary Google sign-in is unchanged.

### Phase 2 — Authorized subscriptions sync

- Use the authorized token to call YouTube Data API `subscriptions.list` with `mine=true`.
- Implement token refresh, pagination, quota-aware retries/backoff, deduplication, and idempotent persistence of channel IDs and required metadata.
- Add a manual sync action and useful sync timestamps/status.
- Handle revoked authorization and refresh failures with a clear reconnect path.
- Acceptance: a connected user can sync and view their subscribed channels; repeated syncs do not duplicate rows and API failures do not corrupt the last good result.

### Phase 3 — Public discovery and subscriptions feeds

- Build a public discovery feed that works without a connected account.
- Build a separate subscriptions feed from the user's synchronized channel data.
- Fetch public channel uploads through the documented API, resolve uploads playlists, and paginate efficiently; avoid routine high-cost search requests.
- Add channel/video cards, channel details, sorting/filtering, loading/empty/error states, and official embedded playback with an external Watch on YouTube fallback.
- Acceptance: visitors can use public discovery without OAuth; connected users can switch to their subscriptions feed; all playback respects YouTube's player requirements.

### Phase 4 — Automation, resilience, and account controls

- Add scheduled/background refresh for subscriptions and channel uploads with configurable cadence.
- Add robust handling for expired/revoked grants, deleted/private channels, quota exhaustion, transient API errors, and partial sync failures.
- Complete disconnect and data deletion behavior, including token revocation where supported and removal of Kairo-held provider data.
- Add privacy-conscious operational logging and monitoring; never log credentials or tokens.
- Acceptance: sync recovers safely from transient failures, users can disconnect cleanly, and stale/invalid connections are clearly identified.

### Phase 5 — Hardening, release readiness, and launch

- Complete responsive UI, accessibility, and user-facing guidance for connecting/reconnecting.
- Add automated tests for OAuth state/session binding, PKCE, token encryption, token refresh, subscription pagination, persistence, quota/error handling, and feed behavior.
- Review YouTube API policy compliance, API console configuration, OAuth consent settings, exact redirect URIs, Worker secrets, D1 migration order, and production environment configuration.
- Run typecheck, tests, and production build; inspect the final diff and resolve all blockers before proposing release.
- Prepare a staged rollout and rollback procedure. No deployment or remote migration occurs without explicit approval.

## Configuration inventory

- Existing Google OAuth client ID/secret are used by the separate YouTube authorization flow.
- Add `YOUTUBE_TOKEN_ENCRYPTION_KEY` as a Worker secret; generate a cryptographically random 32-byte key and keep it out of source control. Never paste the secret into chat.
- Register the exact callback URI `/api/v1/auth/youtube/callback` for each configured environment in the Google OAuth client.
- Enable YouTube Data API v3 in the associated Google Cloud project.
- Public API access will require a Worker-side `YOUTUBE_API_KEY` secret if/when the public feed adapter is implemented.
- Apply the new D1 migration to each environment only after review and explicit release approval.

## Primary references

- YouTube API directory: https://developers.google.com/youtube/apis
- YouTube Data API getting started and quota: https://developers.google.com/youtube/v3/getting-started
- Subscriptions list: https://developers.google.com/youtube/v3/docs/subscriptions/list
- Playlist items list: https://developers.google.com/youtube/v3/docs/playlistItems/list
- YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- Google OAuth 2.0 for web server applications: https://developers.google.com/identity/protocols/oauth2/web-server
- YouTube developer policies: https://developers.google.com/youtube/terms/developer-policies
