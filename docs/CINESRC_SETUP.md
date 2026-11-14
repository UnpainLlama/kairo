# CineSrc direct movie and TV player setup

KAIRO integrates directly with CineSrc using the numeric TMDB IDs already provided by the Movies catalogue.

Official documentation: https://cinesrc.st/docs

## URL formats

Movie:

`https://cinesrc.st/embed/movie/{tmdb_id}`

TV episode (season and episode are 1-indexed):

`https://cinesrc.st/embed/tv/{tmdb_id}?s={season}&e={episode}`

Example from CineSrc:

```html
<iframe
  src="https://cinesrc.st/embed/movie/1084242"
  width="100%"
  height="100%"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen; picture-in-picture"
></iframe>
```

## Player events

CineSrc emits `postMessage` events including `cinesrc:ready`, `cinesrc:play`, `cinesrc:pause`, `cinesrc:timeupdate`, `cinesrc:ended`, `cinesrc:sourceused`, and `cinesrc:error`.

KAIRO listens only when both conditions are true:
- `event.origin === 'https://cinesrc.st'`
- `event.source` is the active KAIRO CineSrc iframe's `contentWindow`

The Movies player uses these events to display ready/play/pause/end/error state, source selection, and playback time/duration. No player command API is needed for this initial integration.

## KAIRO implementation

- `src/lib/moviePlayback.ts` builds and validates direct movie and TV episode URLs.
- `src/components/MovieEmbedPlayer.tsx` embeds CineSrc directly; it does not route through EmbedWave.
- `src/pages/MoviesWatchPage.tsx` passes the movie's TMDB ID to the direct player.
- The player remains click-to-load and provides Open direct, Reload, and Fullscreen controls.
- The iframe is not sandboxed; the provider needs its own scripts and playback controls.
- The iframe uses CineSrc's documented autoplay, fullscreen, and picture-in-picture permissions.

CineSrc documents third-party source switching inside its player. A successful iframe load does not guarantee that every upstream stream is available.
