# YouTube workspace integration

## Scope

The YouTube workspace is a separate, administrator-only section of Kairo. It uses the existing Kairo account and the same account-owned playback system; it does not create a separate identity or progress store.

The implementation is deliberately isolated from the Anime and Movies interfaces. The YouTube route tree is mounted under `/youtube/*`, with its own home/feed, search, channel management, watch, Watch Later and history pages. The shared Kairo shell supplies account profile, sign-out and workspace switching.

## Data and playback

- YouTube catalogue/feed data is requested through Kairo Worker endpoints; the browser does not receive the server-side YouTube Data API key.
- Channel subscriptions, Watch Later and YouTube history remain scoped to the authenticated administrator's Kairo user ID.
- Watch progress uses the shared `/api/v1/me/playback` boundary and the existing local/cloud playback helpers with media type `youtube`.
- The player uses YouTube's iframe player API. Videos that YouTube marks as non-embeddable show an external YouTube link instead.
- YouTube videos marked Made for Kids are not persisted as viewing activity by this interface.
- Removing this workspace does not alter Anime/Movies account data.

## Authorization

- `registerYouTubeAuthRoutes` installs admin-only middleware for `/api/v1/auth/youtube`, `/api/v1/auth/youtube/*` and `/api/v1/youtube/*`.
- YouTube media endpoints also check the session role before returning or mutating administrator data.
- `KairoYouTubeApp` checks the loaded Kairo account role and redirects non-admin users away from the workspace. This is only a UI guard; Worker authorization remains authoritative.
- Regression coverage verifies that a standard signed-in account receives a not-found response on both the YouTube media and OAuth status namespaces, while an administrator session can access the corresponding read endpoints.

## Operational boundary

This integration does not change Worker secrets, Google OAuth client settings, Cloudflare Access policies, D1 schema/migrations, remote data, or deployment configuration. Runtime OAuth connectivity, YouTube API quota and live player playback still require environment/browser verification.
