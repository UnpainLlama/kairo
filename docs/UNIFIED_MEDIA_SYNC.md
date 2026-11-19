# Unified media persistence and sync

Current behavior, reviewed 19 November 2026. One Access identity is shared across Anime, Movies and YouTube; domain history/library schemas remain separate.

## Guest and account modes
- Local development may run as guest when ACCESS_ENFORCED is not true. Guest data stays in browser storage and is not uploaded to D1.
- Protected staging/production require Cloudflare Access and the internal Kairo session. Missing identity is denied, not guest.
- AccountProvider resolves /api/v1/me; useAccountScope adapts account state. Never accept a user ID from the browser.

## Storage map
| Data | Browser module | Account API/D1 |
|---|---|---|
| Anime history/progress/preferences | src/lib/accountStorage.ts | user_watch_history, deletion markers and shared playback |
| Movies lists | src/lib/movieLibraryStorage.ts and useMyList.tsx | user_movie_library_refs via /api/v1/me/movies/library |
| YouTube guest History/Watch Later | src/lib/youtubeLocalLibrary.ts | signed-in admin data via YouTube history/watch-later routes |
| Shared playback state | src/lib/mediaPlayback.ts | user_media_playback via /api/v1/me/playback |

## Shared playback behavior
Shared snapshot identifies mediaType (anime/movie/youtube), media key, title/artwork, duration/progress, completion, supported player state and update time. Existing per-domain history/list tables remain for their UI/delete semantics.
The client saves local checkpoints, queues failed cloud writes per account, retries with bounded exponential backoff and replaces older queued copies with newer snapshots. Each tab has a playback session ID and increasing sequence. Migration 0016 stores these fields; Worker rejects stale writes from the same tab and uses server receive time across sessions.

## Cadence and lifecycle
- src/lib/playbackSync.ts defines PLAYBACK_SERVER_SYNC_INTERVAL_MS = 60_000 (60 seconds).
- Cloud checkpoints are periodic at that interval; user/lifecycle events such as pause, seek, end, pagehide/close and exposed player setting/source changes can flush immediately.
- Local persistence is independent of cloud availability. Failed writes are retried on later playback/account lifecycle flushes.
- Kairo only restores settings exposed by each player API; external providers may not expose quality/captions/source selection.

## Domain notes
Anime combines episode-oriented watch history with shared resume state; deletion/clear markers prevent stale offline copies recreating deleted data. Movies stores status/favorite/rating as TMDB provider/external ID; title metadata is loaded from TMDB and CineSrc is the only Movie player. YouTube Kairo History/Watch Later are not the viewer's YouTube account history; Made-for-Kids videos disable Kairo tracking.

## Related code and tests
Account identity: AccountProvider.tsx, useAccountScope.ts, worker/auth/cloudflareAccess.ts and worker/auth/session.ts. Persistence: browserPersistence.ts, accountStorage.ts and youtubeLocalLibrary.ts. Shared state: mediaPlayback.ts, playbackSync.ts and worker/index.ts. Tests: accountStorage, mediaPlayback, playbackSync, Movie library and YouTube local library suites plus Worker account/security tests.