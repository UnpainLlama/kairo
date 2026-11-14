# VidLink movie player setup

Kairo's Movies catalogue is supplied by TMDB, so movie playback uses the same numeric TMDB movie ID returned as `MovieDetail.externalId`.

## Official embed format

VidLink's official documentation specifies:

- Movie URL: `https://vidlink.pro/movie/{tmdbId}`
- A numeric TMDB movie ID is required.
- No VidLink API key is required for the iframe embed.
- The optional `player=jw` query parameter selects JW Player; omitting it uses the default VidLink player.

Official documentation: https://vidlink.pro/

## Kairo implementation

- `src/lib/moviePlayback.ts` validates the numeric ID and builds only the documented URL.
- `src/components/MovieEmbedPlayer.tsx` loads the iframe after an explicit Play click, allows fullscreen/media playback, and provides an Open direct fallback.
- The iframe does not use a `sandbox` attribute because the provider's player needs its own scripts and playback controls.
- Messages are accepted only when the sender origin is exactly `https://vidlink.pro` and the sender is Kairo's active VidLink iframe.
- The documented `MEDIA_DATA` message is saved in local storage as `vidLinkProgress` for the Continue Watching data format described by VidLink.

## Troubleshooting

1. Use **Open direct** to open the exact embed URL in a new tab. If it does not play there, the issue is with VidLink or that title's availability, not Kairo's iframe.
2. If the direct URL plays but the embedded frame does not, inspect the browser console for frame/CSP or extension errors.
3. Switch to **JW Player** to test VidLink's documented alternate player implementation.
4. VidLink controls its own stream sources and availability. Kairo can load the official embed but cannot repair a missing or unavailable source inside VidLink.
