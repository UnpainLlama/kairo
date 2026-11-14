# Kairo local data and sync audit

**Reviewed:** 2026-11-14  
**Baseline:** `main` at `471842a76eaae9b4b18506e4603abf843e1780d0`  
**Scope:** Anime playback/history/library, Movies, YouTube, browser persistence, and the Worker account APIs.

## Executive summary

Kairo does not currently have one shared sync layer. Each media area owns its own persistence rules:

- Anime stores playback state locally and also writes signed-in history to D1.
- YouTube stores a local resume point and syncs signed-in playback history and Watch Later to D1.
- Movies had no equivalent library in the unified app. This branch adds a browser-local list, isolated by guest/account scope. It is deliberately not described as cloud sync.

The existing pattern is a good foundation, but cross-device restore, conflict handling, and library CRUD are inconsistent between areas.

## Current behavior and findings

### Anime

**What works**
- `src/lib/accountStorage.ts` uses distinct `guest` and account-ID namespaces for watch history, playback progress, and preferences.
- Legacy, unscoped history is migrated only into the guest namespace. It is not automatically attributed to whichever account happens to be signed in.
- `WatchPage` persists local playback progress and history for guests and signed-in viewers.
- Signed-in playback writes to `POST /api/v1/me/history/sync`, periodically while playing and on important playback/page-exit events.
- The Profile and History pages call the same sync endpoint and store the returned server rows locally.

**Gaps**
1. **Direct cross-device resume is not reliable on first entry.** The watch page writes to the remote endpoint, but its initial resume source is browser storage. The explicit D1-to-browser restore currently happens from the Profile/History sync flow. A user opening an episode directly on a second device can start at zero until that sync flow has run.
2. **Deletes have no tombstones.** The history sync endpoint uses `updated_at` to reject older upserts, which is useful for progress updates. But deletes remove rows immediately. A stale offline device can later upload its old copy and recreate a deliberately deleted row. The `clear` operation has the same stale-client resurrection risk.
3. **The documented API contract is ahead of the Worker.** `docs/API_CONTRACT.md` lists separate history/progress and library CRUD routes, while the current Worker history implementation is a combined POST sync endpoint and the Anime library route found in `worker/index.ts` is read-only. Treat the contract as aspirational until those routes are implemented and tested.
4. **Library behavior is incomplete.** The profile page can count server library rows, but there is no complete guest-local Anime library plus sign-in sync/import flow in the current UI.

### YouTube

**What works**
- `YouTubeWatchPage` stores resume seconds under a guest or account-specific key.
- Signed-in viewers load remote history and Watch Later data when opening a video.
- Signed-in playback progress is posted to `/api/v1/youtube/history`; server writes are scoped to the authenticated user and use update timestamps.
- Watch Later is stored in D1 for signed-in accounts and supports removal.
- Tracking is deliberately disabled for videos marked Made for Kids.

**Gaps**
1. **Guest library visibility is limited.** Guest resume seconds are stored, but the History and Watch Later pages require sign-in. There is no guest-facing list of locally resumed videos.
2. **Failed uploads are not queued.** The watch page keeps a local resume value when the remote POST fails, but catches the failure without recording a pending write or guaranteeing a retry.
3. **Local and remote resume versions are not compared.** The local value is only a number of seconds; the remote row has an update timestamp. On the next load, an existing remote value takes precedence even if a more recent local value was left behind by a failed upload. A timestamped local record and explicit version comparison would avoid that rollback.
4. **Watch Later has no local/offline cache.** This is acceptable as an explicit server-backed feature, but the UI should distinguish “not signed in” from “temporarily unavailable” and may benefit from a per-account cache if offline access is a product requirement.

### Movies

**Before this branch**
- The old standalone `UnpainLlama/movies` app persisted Redux state through startup hydration and a store subscription.
- Its Watchlist and Likes were keyed by local profile ID in `localStorage`; all reads/writes were guarded for browser storage failures.
- That old app's accounts and profiles were themselves device-local mock state, not Kairo cloud identities.

**Current Kairo boundary**
- The unified Movies workspace uses live TMDB metadata. Movie detail data is not guaranteed to have a corresponding canonical row in D1.
- Migration `0012_movies_catalogue.sql` defines `user_movie_library`, but the current Worker does not expose Movies library CRUD routes.
- The Movies architecture document explicitly requires provider retention/licence review before persisting provider payloads. Therefore, simply writing live TMDB results into the current D1 catalogue as part of a library action would cross that boundary.

**Change in this branch**
- Adds a My list with Watchlist, Watched, and Favorite states.
- Browser storage is isolated by guest scope or Kairo account ID. It works without sign-in, survives refreshes, and does not copy guest items into an account automatically.
- The UI explicitly says the list is browser/device-local and does not sync across devices yet.
- No TMDB metadata is newly persisted to D1 by these actions.

### Identity and browser storage

- The shell, Anime watch page, Profile/History pages, and YouTube watch page each resolve session identity independently. Auth-change events help refresh views, but this is duplicated fetch/state logic rather than one application-level auth source.
- YouTube recent-search queries are stored under one global browser key rather than an account/guest namespace. This is a small shared-device privacy issue.
- Browser storage writes are generally guarded with try/catch, but the low-level storage helpers and event names differ across features.

## Recommended changes, in priority order

### 1. Make Anime resume truly cross-device

Add a signed-in read path for the current episode's progress (or a bounded history fetch) and resolve it before initializing the player. Compare the remote record with the local record using `updatedAt`, then restore the newest valid position. Keep guest behavior local-only.

### 2. Add deletion tombstones and a conflict model

Give history items a server revision or per-item `deletedAt`. A delete/clear must survive stale devices coming back online. Merge by a deterministic version rule, and return the canonical server state. Do not rely on client wall clocks alone for an indefinitely offline client.

### 3. Establish one account/session provider

Move the repeated `/api/v1/me` calls into a shared React auth provider with explicit states: loading, signed out, signed in, and unavailable. All account-scoped local stores should wait for identity resolution; a network/server error must not silently be treated as a guest session.

### 4. Finish Anime library CRUD

Bring the Worker routes, API contract, and UI into agreement. Implement authenticated add/update/remove endpoints with per-user ownership checks and tests. Decide separately whether guests get a device-local library and whether sign-in offers a user-confirmed import.

### 5. Define a safe Movies cloud-sync design

Keep this branch's local list until the metadata-retention decision is settled. For cross-device sync, use stable Kairo movie identity and a licensed/approved metadata-retention policy, or store only an approved provider namespace/external ID reference in the account library. Then add authenticated list/upsert/delete APIs and account-isolation tests. Do not make TMDB ingestion a side effect of pressing Watchlist.

### 6. Make YouTube writes recoverable

Store local playback progress as `{ seconds, updatedAt }`, compare it with the D1 row on load, and retain a bounded pending-write queue until the server acknowledges the newest update. Retry on the next playback event and when connectivity returns. Keep Made-for-Kids tracking disabled.

### 7. Isolate small browser preferences consistently

Move YouTube recent searches to the same guest/account namespace policy used by other local data. Decide whether search history should be account-local, guest-local, or not persisted at all.

## Suggested validation matrix

Before calling sync complete, test all of these for each supported media feature:

- Guest state survives refresh and stays separate from every signed-in account.
- Two accounts on one browser cannot see each other's saved lists or progress.
- A signed-in user sees the same state on a second device after login.
- Offline writes reconcile after reconnect without losing the newest progress.
- Deletes and clear operations remain deleted when an older device returns.
- Sign-out/sign-in transitions never briefly write account data into the guest namespace.
- Browser storage unavailable/quota exceeded does not break catalogue browsing or playback.
- Multiple tabs refresh their UI after a local change.

## Scope note

This is a source-code audit of the repository at the baseline commit above. It does not claim that every staging/production environment has identical secrets, migration state, or deployed Worker code. Remote sync recommendations should be implemented with integration tests against the target D1 schema before being treated as production-ready.
