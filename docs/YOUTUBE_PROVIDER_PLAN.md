# YouTube — current implementation and remaining plan

Current scope: administrator-only Kairo YouTube workspace, reviewed 19 November 2026. Full routes are documented in API_CONTRACT.md.

## Implemented
- React routes and Worker APIs are both administrator-only.
- Official YouTube Data API v3 powers video/channel keyword search, metadata, embedding permission and Kairo's curated saved-channel uploads feed.
- Saved channels are the channels Kairo's administrator selects; adding one to Kairo does not subscribe the viewer to it on YouTube.
- Official YouTube IFrame Player API playback with external Watch on YouTube fallback.
- Kairo-owned History and Watch Later are not the viewer's YouTube account history.
- Shared playback snapshots support YouTube state; Made-for-Kids videos disable Kairo tracking.

## Module map
UI: YouTubeFeedPage, YouTubeSearchPage, YouTubeChannelsPage, YouTubeWatchPage and YouTubeLibraryPages. Components: YouTubeVideoCard and YouTubeIframePlayer. Worker: worker/auth/youtube.ts (OAuth/admin channels/feed) and worker/youtube/routes.ts (media metadata/history/Watch Later). Helpers: youtubeLocalLibrary.ts, youtubeSearchSuggestions.ts and mediaPlayback.ts. Schema: migrations 0007–0011 plus shared playback migrations 0014/0016.

## Security boundaries
- Cloudflare Access is Kairo sign-in. Optional YouTube OAuth is separate Google authorization.
- Keep Data API key, OAuth client secret and token encryption key in Worker-only secrets.
- Use official APIs only: no scraping, cookies, undocumented InnerTube, stream extraction or proxying video bytes.
- Preserve AdminOnly checks in UI and Worker; respect embedding, Made-for-Kids, quota, attribution and retention rules.

## Not implemented
- Guest/public general YouTube discovery.
- Importing actual YouTube subscriptions via subscriptions.list(mine=true).
- Personalized YouTube Home recommendations.
- General background subscription synchronization.

Do not describe the current Kairo-curated feed as the user's YouTube subscriptions.