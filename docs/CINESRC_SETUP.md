# CineSrc movie player setup

Kairo's Movies catalogue comes from TMDB, so playback uses the numeric TMDB movie ID (`MovieDetail.externalId`).
This replaces the old VidLink player. `docs/VIDLINK_SETUP.md` is obsolete and can be deleted.

## Embed format

From the official docs (https://cinesrc.st/docs):

- Movie URL: `https://cinesrc.st/embed/movie/{tmdb_id}`
- No API key is needed for the iframe embed.
- Parameters used: `autoplay=true`, `back=close`, `color=%23e5e5e5`.
- `back=close` makes the player's own back button send a `cinesrc:close` message to the page.

## Implementation

- `src/lib/moviePlayback.ts` validates the ID and builds the URL. Tests are in `moviePlayback.test.ts`.
- `src/components/MovieEmbedPlayer.tsx` renders a full-screen iframe that starts when the watch page opens.
  There is no source switcher, reload, open-in-tab or full-screen button of our own.
- Messages are accepted only from `https://cinesrc.st` and only from this iframe.
- Handled messages: `cinesrc:close` (go back), `cinesrc:ready`, `cinesrc:error`.
- Esc also goes back when the page is not in full screen.

## Troubleshooting

1. Open `https://cinesrc.st/embed/movie/{id}` directly. If it does not play there, the title is unavailable at CineSrc.
2. If it plays directly but not embedded, check the browser console for frame or CSP errors. The worker currently sends no CSP, only `X-Frame-Options: DENY` for Kairo's own pages.
3. CineSrc controls its own sources and server list inside its player.
