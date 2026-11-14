# Unified media persistence and sync

**Status:** Initial shared implementation, November 2026.

Kairo has one account identity across Anime, Movies and YouTube. The signed-in user's stable user_profiles.id, resolved from GET /api/v1/me by the HttpOnly Kairo session cookie, is the owner key used by each media service. The browser must never invent an account ID or infer signed-in status from a failed network request.

## Guest mode

When signed out, personal media state stays in the current browser's site storage:

- Anime: watch history, episode progress, paused-history preference and playback preferences.
- Movies: My list, Watchlist, Watched and Favorites.
- YouTube: playback progress, Watch history and Watch Later.

Guest keys use a dedicated guest namespace. A guest action never calls a signed-in write API and is never sent to D1. Data remains available after refreshes and browser restarts on the same browser profile. It is not available on another device.

**Browser clearing detail:** localStorage is separate from cookies. Clearing only cookies does not necessarily erase guest lists or progress. To remove guest data, the user must clear Kairo's site data/storage (or the browser's broader site data), which may include cookies, localStorage and other site storage.

Signing in does not silently attach guest activity to an account. Guest and account data remain separate to avoid attributing activity to the wrong person on shared devices. An explicit guest-to-account import can be added as a separate, user-confirmed flow.

## Kairo account mode

After the shared account provider resolves the current session, signed-in writes are stored against the same Kairo user ID in D1. That data is then available on other devices after the same account signs in.

| Media | Account-owned server data | Browser copy |
|---|---|---|
| Anime | Episode history and playback progress in user_watch_history | Account-scoped progress/history cache |
| Movies | Provider ID + external movie ID, Watchlist/Watched/Favorite flags and optional rating in user_movie_library_refs | Per-account display cache |
| YouTube | Playback history and Watch Later in youtube_watch_history and youtube_watch_later | Timestamped local progress cache |

The three media areas are separate data domains; they share account identity, not a common media metadata table. For example, Movies library state does not use Anime's user_library table.

## Shared browser foundation

- src/lib/AccountProvider.tsx resolves loading, guest, signed-in and unavailable account states once for the application.
- src/hooks/useAccountScope.ts exposes the same resolved identity to account-scoped features.
- src/lib/browserPersistence.ts provides guarded JSON/text reads and writes and shared storage change notifications.
- Feature-specific modules retain their own schemas, keys and validation so one media domain cannot accidentally deserialize another domain's state.

HttpOnly session cookies remain the authentication mechanism. No session token, password, Google token or YouTube OAuth token is written to browser storage.

## Sync and conflict behavior

### Anime
The watch page requests the signed-in account's current episode history before mounting the player. It compares timestamps with the browser copy and uses the newer valid position. Progress writes still save locally first and post to the account endpoint. The Worker records per-episode delete tombstones and an account-wide clear marker so an older offline browser copy cannot recreate a deliberately deleted history entry.

### Movies
Signed-in Watchlist, Watched and Favorite actions write to the account library API. The account table stores only the approved provider namespace and external movie identifier plus the user's own list state. Live TMDB display metadata is still retrieved through the Movies provider API; adding a title to a list does not trigger a catalogue ingestion or copy a provider payload into the user library.

### YouTube
Signed-in watch history and Watch Later continue to use the authenticated YouTube media endpoints. Signed-out history and Watch Later use dedicated guest-only browser keys. Local progress is timestamped; if a signed-in browser has a newer unsynced copy when the video is opened again, Kairo retries that write rather than replacing it with an older server position. Made-for-Kids tracking remains disabled.

## Important limitations

This is account-backed cross-device sync, not a fully offline-first replication engine:

- Anime progress retries on subsequent playback events and direct-entry restore; there is not yet a general background outbox for every media operation.
- YouTube retries a newer local playback position when the same video is opened again, but does not yet have a durable general-purpose write queue for all YouTube mutations.
- Movies account list edits require a successful API write. The list is not advertised as editable offline.
- Guest-to-account migration is not automatic and is not part of this initial sync implementation.
- Browser-local caches can be cleared independently of the Kairo account's D1 records. Clearing site data does not delete server-side account data.

These boundaries are surfaced in the product rather than implying that browser storage is cloud sync.
