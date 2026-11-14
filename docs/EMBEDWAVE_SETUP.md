# EmbedWave movie and TV player setup

EmbedWave documents a direct iframe integration addressed by TMDB IDs. Its public documentation states that the player requires no API key or signup.

Official references:
- Home and embed examples: https://embedwave.cc/
- URL, parameter and server documentation: https://embedwave.cc/docs

## URL formats

Movie:

`https://embedwave.cc/embed/movie/{tmdb_id}`

TV episode (season and episode are 1-indexed):

`https://embedwave.cc/embed/tv/{tmdb_id}/{season}/{episode}`

Recommended iframe attributes:

```html
<iframe
  src="https://embedwave.cc/embed/movie/533535"
  allowfullscreen
  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
  referrerpolicy="no-referrer"
></iframe>
```

## Server selection

The documentation lists these optional `server` values:
- `nxsha` — Multi HD
- `cinesrc` — Cinesrc
- `videasy` — 4K

When no server is specified, EmbedWave chooses its default. KAIRO exposes Automatic plus the documented server choices in the Movies player.

Other documented parameters include `autoplay=1` and `nobrand=1`. KAIRO does not request autoplay, and does not hide the branding badge.

## KAIRO implementation

- `src/lib/moviePlayback.ts` builds and validates movie and TV episode URLs.
- `src/components/MovieEmbedPlayer.tsx` embeds the movie URL with the documented permissions and `no-referrer` policy.
- `src/pages/MoviesWatchPage.tsx` connects the movie's TMDB ID to the player.
- The iframe is intentionally not sandboxed; the provider needs its player scripts and controls.
- The player remains click-to-load and provides Open direct, Reload and Fullscreen controls.

EmbedWave says it routes to third-party upstream sources and does not host video. Stream availability and rights therefore depend on those upstream sources and applicable permissions; a successful iframe load alone does not prove a playable stream.
