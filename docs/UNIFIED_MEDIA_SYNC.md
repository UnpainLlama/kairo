# Unified media persistence and sync

**Status:** Shared media sync with Cloudflare Access-native identity, November 2026.

Kairo has one account identity across Anime, Movies and YouTube. Cloudflare Access is the only user sign-in. After the Access JWT is verified, the Worker resolves or provisions the profile for that exact approved email. GET /api/v1/me automatically creates the internal HttpOnly Kairo session used by existing services; its stable user_profiles.id is the owner key for every media domain. The browser must never invent an account ID or infer signed-in status from a failed network request.

## Guest mode

When signed out, personal media state stays in the current browser's site storage:

- Anime: watch history, episode progress, paused-history preference and playback preferences.
- Movies: My list, Watchlist, Watched and Favorites.
- YouTube: playback progress, Watch history and Watch Later.

Guest keys use a dedicated guest namespace. A guest action never calls a signed-in write API and is never sent to D1. Data remains available after refreshes and browser restarts on the same browser profile. It is not available on another device.

**Browser clearing detail:** localStorage is separate from cookies. Clearing only cookies does not necessarily erase guest lists or progress. To remove guest data, the user must clear Kairo's site data/storage (or the browser's broader site data), which may include cookies, localStorage and other site storage.

When Access enforcement is disabled (local development only), signing in is not available and the browser remains in guest mode. On Access-protected staging/production, missing or invalid Access identity is denied rather than treated as a guest. Guest and account data remain separate to avoid attributing activity to the wrong person on shared devices. An explicit guest-to-account import can be added as a separate, user-confirmed flow.

## Kairo account mode

After the shared account provider resolves the verified Access identity and internal session, signed-in writes are stored against the same Kairo user ID in D1. That data is then available on other devices after the same approved email authenticates through Cloudflare Access. No separate Kairo username/password is required.

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

The internal Kairo session is an HttpOnly cookie, bound to the currently verified Access email. No session token, password, Google token or YouTube OAuth token is written to browser storage. Signing out goes through Cloudflare Access logout; removing only the internal cookie would otherwise cause /api/v1/me to recreate it while the Access session remains valid.

## Sync and conflict behavior

### Anime
The watch page requests the signed-in account's current episode history before mounting the player. It compares timestamps with the browser copy and uses the newer valid position. Progress writes still save locally first and post to the account endpoint. The Worker records per-episode delete tombstones and an account-wide clear marker so an older offline browser copy cannot recreate a deliberately deleted history entry.

### Movies
Signed-in Watchlist, Watched and Favorite actions write to the account library API. The account table stores only the approved catalogue namespace and external movie identifier plus the user's own list state. Live TMDB display metadata is retrieved through the Movies catalogue API; CineSrc is the sole playback provider and is separate from library persistence. Adding a title to a list does not trigger catalogue ingestion or copy a provider payload into the user library.

### YouTube
Signed-in watch history and Watch Later continue to use the authenticated YouTube media endpoints. Signed-out history and Watch Later use dedicated guest-only browser keys. Local progress is timestamped; if a signed-in browser has a newer unsynced copy when the video is opened again, Kairo retries that write rather than replacing it with an older server position. Made-for-Kids tracking remains disabled.

## Unified player progress and settings (migration 0014)

All three players now write a shared snapshot in `user_media_playback`, keyed by the same Kairo `user_id` plus media type and stable media key:

- Anime: `anime slug:episode number`
- Movies: numeric TMDB ID
- YouTube: 11-character YouTube video ID

The migration backfills Anime and YouTube resume positions from their existing account history tables. New player sessions save local progress and supported controls to the browser at approximately one-second intervals. Signed-in sessions also sync the shared snapshot to D1 at least every 15 seconds while playing and on user/lifecycle events. When a player opens, Kairo compares the local snapshot with the account snapshot, restores the newer position/settings and retries a newer local copy to the server. Exit requests use keepalive and the local snapshot is written before the network request.

Captured state is provider-dependent. Kairo saves position, duration, volume, mute and playback rate where the player API exposes them. CineSrc also exposes its selected source ID, which Kairo persists and asks CineSrc to prefer on the next open. Anime HTML/HLS playback stores the active subtitle language when exposed by the media element. Quality/captions/source behavior that an external provider does not expose cannot be recreated by Kairo.

The shared record supplements the existing per-media history and list endpoints; it does not combine the schemas for Anime history, Movies watchlist, or YouTube Watch Later. Deleting an Anime or YouTube history entry also removes its shared resume record.

## Important limitations

This is account-backed cross-device sync, not a fully offline-first replication engine:

- Anime progress retries on subsequent playback events and direct-entry restore; there is not yet a general background outbox for every media operation.
- YouTube retries a newer local playback position when the same video is opened again, but does not yet have a durable general-purpose write queue for all YouTube mutations.
- Movies account list edits require a successful API write. The list is not advertised as editable offline.
- Guest-to-account migration is not automatic and is not part of this initial sync implementation.
- Browser-local caches can be cleared independently of the Kairo account's D1 records. Clearing site data does not delete server-side account data.

These boundaries are surfaced in the product rather than implying that browser storage is cloud sync. Cloudflare Access's per-application Allow policy is the invitation list: only exact approved email addresses should be included; do not use a domain-wide or Everyone rule.
