# Movie Continue Watching and Playback Progress

Kairo keeps movie playback progress separate from the movie watchlist state. A movie can therefore be in Continue Watching, be marked watched, be in My List, or be liked independently.

## Playback state

Each progress record is keyed by the viewer account, provider ID (`tmdb`), and external movie ID. It stores:

- Current playback position in seconds
- Media duration in seconds
- Whether playback is complete
- A client event timestamp

The browser writes progress to an account-scoped local cache (or the isolated guest cache). For signed-in viewers it also synchronizes to D1 through `/api/v1/me/movies/progress`.

## Save and resume behaviour

The CineSrc iframe sends documented `postMessage` events. Kairo accepts events only from `https://cinesrc.st` and the active iframe window.

- `cinesrc:timeupdate`: update the local cache at most once every five seconds and send account updates at most once every fifteen seconds
- `cinesrc:pause` and `cinesrc:ended`: save and synchronize immediately, using the latest time update because these events do not include a position payload
- `pagehide` and player unmount: flush the latest known position using a keepalive request
- Resume: open the embed with the saved `t` position and `continueprompt=false`; completed titles start from the beginning when played again

The server only replaces a stored row with an event timestamp that is at least as recent as the stored timestamp. If synchronization is unavailable, the browser keeps its local copy and retries on a later playback event or visit.

## Continue Watching and My List

The Movies home screen reads recent unfinished progress, excludes completed titles and positions shorter than five seconds, and shows the remaining titles in a Continue Watching rail.

My List combines watchlist/favourite/watched entries with playback history. Its filters separate Continue Watching, My List, Watched, and Liked. Cards with playback state show a progress bar and watched percentage. Removing a card from this page removes both its saved-library state and playback progress.

Guest data is browser-local. Signed-in progress is account-scoped and can be restored on another device.

## Database migration

Account synchronization requires `migrations/0014_movie_watch_progress.sql` to be applied to the target D1 environment before the new progress API is used there. This change does not apply migrations or deploy an environment automatically.

## Provider contract

The iframe parameters and event names follow the [CineSrc player documentation](https://cinesrc.st/docs). In particular, the documented resume parameter is `t` (alias `time`), and `continueprompt=false` skips the continue/restart prompt.
