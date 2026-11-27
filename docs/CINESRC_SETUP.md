# CineSrc Movie playback

CineSrc is Kairo's **sole Movie playback provider**. There is no VidLink integration, alternate
Movie player, or playback fallback.

The Movies catalogue remains separate: TMDB supplies discovery, search, details, artwork and
the numeric movie ID. CineSrc uses that numeric TMDB ID to identify the movie in its iframe.
CineSrc is a playback provider, not Kairo's catalogue or metadata API.

## Official embed

Official documentation: https://cinesrc.st/docs

Movie embed URL:

```text
https://cinesrc.st/embed/movie/{tmdb_id}
```

Kairo builds the URL with these documented parameters:

- `autoplay=true`
- `back=close` — CineSrc sends `cinesrc:close` when its back control is used.
- `color=%23e5e5e5` — grayscale player accent.

The documented iframe embed requires no CineSrc API key, no Worker secret, no Kairo playback
proxy and no direct-stream resolver.

## Kairo implementation

- `src/lib/moviePlayback.ts` validates a positive numeric TMDB ID and builds the embed URL.
- `src/components/MovieEmbedPlayer.tsx` renders the CineSrc iframe as the full-screen player.
- `src/pages/MoviesWatchPage.tsx` loads the movie detail and passes the TMDB identifier to
  the player.
- `src/lib/moviePlayback.test.ts` covers URL construction and invalid ID rejection.
- Message handling verifies both the exact `https://cinesrc.st` origin and the active iframe
  source. Kairo currently handles `cinesrc:ready`, `cinesrc:error` and `cinesrc:close`.
- The provider owns the internal stream/source selection and title availability. Kairo does
  not scrape or extract stream URLs and does not silently switch to another movie provider.

## Troubleshooting

1. Open the generated CineSrc embed URL directly. If the title is unavailable there, Kairo
   cannot make it playable.
2. If the direct embed works but the iframe does not, inspect browser console errors and
   browser privacy/extension settings.
3. Use Kairo's player retry control for a transient iframe/player error. There is no alternate
   provider to switch to.
4. CineSrc's player and source availability are controlled by CineSrc. Check its current
   [documentation](https://cinesrc.st/docs) for changes to embed parameters or player events.
