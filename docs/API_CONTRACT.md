# API contract — `/api/v1`

## Movies provider boundary

The `/api/v1/movies/*` catalogue routes use TMDB for discovery, search, genres and detail
metadata when the Movies feature is enabled. The returned numeric TMDB movie ID is also the
identifier used for playback.

Movie playback is not resolved by a Kairo API route. The client embeds
`https://cinesrc.st/embed/movie/{tmdb_id}` through the official CineSrc iframe integration.
CineSrc is the **only** Movie playback provider; there is no VidLink route, secondary player,
or direct-stream extraction fallback. The iframe integration needs no additional Kairo
Worker secret. See [docs/CINESRC_SETUP.md](CINESRC_SETUP.md).


All routes are same-origin behind the Cloudflare Worker unless a deployment architecture explicitly separates the API. Use JSON and UTF-8. Query values must be validated and bounded. In live mode, when the `TMDB_ACCESS_TOKEN` Worker secret is configured, catalogue cards and anime details are enriched with TMDB poster/backdrop URLs and TMDB may fill missing synopsis, rating, genres, release year and total TV episode count. Existing non-empty catalogue metadata takes precedence. Episode rows may receive TMDB still thumbnails, but episode discovery and playback remain separate. The legacy `CATALOG_SOURCE=db` routes do not use this enrichment. Catalogue results remain available if TMDB is unavailable.

## 1. Response envelope

Success:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "req_example" }
}
```

Paginated success:

```json
{
  "success": true,
  "data": { "items": [] },
  "meta": { "page": 1, "limit": 24, "total": 0, "hasNextPage": false, "requestId": "req_example" }
}
```

Error:

```json
{
  "success": false,
  "error": { "code": "RESOURCE_NOT_FOUND", "message": "The requested resource was not found." },
  "meta": { "requestId": "req_example" }
}
```

Do not expose stack traces, SQL, provider tokens, internal hostnames, or secret configuration.

## 2. Public catalogue routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Minimal liveness probe (no dependencies). Cloudflare Access protects it unless an exact public Worker destination override is explicitly configured. |
| GET | `/api/ready` | Readiness probe (verifies D1/schema; 503 if unavailable). Cloudflare Access protects it unless an exact public Worker destination override is explicitly configured. Detailed dependency fields are omitted when Access enforcement is enabled. |
| GET | `/api/v1/catalog/featured` | Featured titles |
| GET | `/api/v1/catalog/trending?page=1&limit=24` | Trending titles |
| GET | `/api/v1/catalog/latest?page=1&limit=24` | Recently updated titles |
| GET | `/api/v1/catalog/search?q=...&page=1&limit=24` | Search |
| GET | `/api/v1/catalog/browse?season=winter&year=2026&sort=popularity&page=1&limit=24` | Filter-only catalogue browse (genre, year, format, status, season, sort) |
| GET | `/api/v1/catalog/genres` | Available genres |
| GET | `/api/v1/anime/:id` | Anime details |
| GET | `/api/v1/anime/:id/episodes?page=1&limit=50` | Episodes |
| GET | `/api/v1/anime/:id/related` | Related titles |

Search parameters:
- `q`: trimmed string, 2–100 characters.
- `page`: integer 1–500.
- `limit`: integer 1–50; default 24.
- Optional filters: `genre` (letters/numbers/space/`&`/`'`/`-`, up to 40 chars, matched case-insensitively against a title's genre list), `year` (1900–2100), `format` (`series|movie|ova|ona|special`), `status` (`airing|finished|upcoming|hiatus`), `season` (`winter|spring|summer|fall`), `sort` (`relevance|popularity|trending|latest|rating`). Enum values are case-insensitive. Stored catalogue values must be normalised to these forms at ingestion for the filters to match.
- `sort=rating` places titles without a rating last; it never invents a rating. In live mode, `sort=trending` uses AniList's `TRENDING_DESC`; fallback providers approximate it with their popularity ordering.
- Reject invalid sort keys rather than interpolating them into SQL.

### Implementation notes (current behaviour)

- In legacy `CATALOG_SOURCE=db` mode, `trending` ranks by stored `popularity_score` and `latest` by the catalogue row's `updated_at`. In live mode, AniList supplies trending-score ordering and currently airing titles newest-first; see docs/LIVE_CATALOGUE.md.
- In DB mode, `genres` returns counts derived from stored title genre lists. In live mode, AniList returns its genre collection without counts.
- Related-title behavior is provider-specific in live mode (AniList relations and recommendations, with provider fallbacks). The legacy DB route uses shared genres. Accepts `limit` (1–24, default 12).
- Filter-only `/api/v1/catalog/browse` is supported in both live and legacy D1 catalogue modes. In D1 mode filters are bound against the stored genre/year/format/status/season fields and sort uses the same fixed whitelist as search.
- D1 catalogue mode resolves episode servers/playback only through a stored AniList or MAL provider-ID mapping plus the configured independent episode provider. A title without a supported mapping returns `EPISODE_SOURCE_UNAVAILABLE`; a mode without a server-capable episode provider returns `PROVIDER_UNAVAILABLE` rather than a missing-route 404.

## 2b. Provider routes (added; existing routes unchanged)

| Route | Purpose |
|---|---|
| `GET /api/v1/providers` | Metadata providers: enabled flag, `termsVerified`, capabilities, attribution. Also `unknownConfigured` for names in `METADATA_PROVIDERS` that no adapter handles. |
| `GET /api/v1/anime/:id/metadata` | Unified record for a title (id or slug): the stored row merged with enabled providers. Adds `provenance`, `conflicts`, `ids`, `sources` and `providers` (per-provider outcome: `ok`, `cached`, `not_found`, `skipped`, `failed`). `meta.degraded` is true when any enabled provider failed. A provider failure never fails the request; the stored row is always the floor. Errors: `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, `CATALOG_UNAVAILABLE`. |

Ratings are on a 0-10 scale. See docs/PROVIDERS.md.

## 3a. Administrator routes

All administrator routes require a valid Kairo session whose server-side profile has `role='admin'`. The one-time bootstrap endpoint is the only exception: it is public at the Kairo API layer but requires the temporary `ADMIN_BOOTSTRAP_TOKEN` Worker secret, a same-origin request, an incomplete bootstrap marker and no existing administrator.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/admin/bootstrap` | Create the first administrator with a chosen username and password. Requires `X-Kairo-Bootstrap`; succeeds only once and creates an authenticated eight-hour admin session. |
| GET | `/api/v1/admin/console-path` | Return the current 30-minute administrator console path. |
| GET | `/api/v1/admin/accounts` | List standard accounts, credential state and the 15-account allocation count. |
| POST | `/api/v1/admin/accounts` | Create a standard account. Returns a generated temporary password once; the new account must change it at first sign-in. |
| POST | `/api/v1/admin/accounts/:id/enroll` | Add username/password credentials to an existing standard profile without changing its account ID or owned data. Returns a temporary password once. |
| POST | `/api/v1/admin/accounts/:id/password` | Reset a standard account password. Returns a temporary password once and requires password change at next sign-in. |
| PATCH | `/api/v1/admin/accounts/:id/status` | Suspend or reactivate a standard account. Suspension revokes its sessions. |
| DELETE | `/api/v1/admin/accounts/:id` | Permanently delete account-owned data after explicit `confirmDataDeletion: true`; retains a minimal profile tombstone. |

The single-admin rule and 15-standard-account limit are enforced by the Worker/database. Temporary passwords are returned only in the authenticated administrator response and must be delivered securely; do not place them in logs, browser storage or issue comments. The console path is an obscurity layer, not an authentication mechanism.

## 3. Authenticated user routes

Kairo account authentication is local username/password. The browser submits the username and password to the Worker; the Worker verifies the salted password hash and issues an opaque HttpOnly session cookie. User identity and ownership are derived from that session, never from a client-supplied user ID.

Cloudflare Access remains a separate outer edge perimeter under the current Wrangler/deployment configuration. The Worker no longer validates an Access JWT, provisions an account from an Access email, or binds Kairo accounts to an Access subject. Passing the outer Access gate does not create a Kairo account or replace the Kairo username/password.

Public at the Kairo application layer:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout` (only revokes the caller's Kairo session)
- `POST /api/v1/admin/bootstrap` (one-time token and origin protected)

Every other `/api/v1/*` route requires an active Kairo session. While `mustChangePassword` is true, the Worker permits only `GET /api/v1/me`, `POST /api/v1/me/password` and `POST /api/v1/auth/logout`. Public registration is disabled; standard accounts are created or enrolled by an administrator.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/login` | Authenticate a username/password pair and set the Kairo session cookie. Unknown usernames and incorrect passwords share the same generic response. Failed attempts are rate-limited. |
| POST | `/api/v1/auth/logout` | Revoke the current Kairo session and clear its HttpOnly cookie. It does not terminate the separate Cloudflare Access browser session. |
| GET | `/api/v1/me` | Return the authenticated profile, role, username and forced-password-change state. |
| POST | `/api/v1/me/password` | Verify the current password, set a new password, clear forced-change state and revoke every other session for the account. |
| GET | `/api/v1/me/preferences` | Read the account-wide history recording preference (`historyPaused`). |
| PUT | `/api/v1/me/preferences` | Update the account-wide history recording preference (`historyPaused`); applies to Anime and Movies on all devices. |
| GET | `/api/v1/me/library` | Read the signed-in user's Anime library. |
| PUT | `/api/v1/me/library/:animeId` | Add or update an Anime library item. |
| DELETE | `/api/v1/me/library/:animeId` | Remove an Anime library item. |
| GET | `/api/v1/me/movies/library` | Read the signed-in user's Movies library references. |
| POST | `/api/v1/me/movies/library` | Add or update a Movies library reference. |
| DELETE | `/api/v1/me/movies/library/:providerId/:externalId` | Remove a Movies library reference. |
| GET | `/api/v1/me/history/sync` | Restore account-backed watch-history state. |
| POST | `/api/v1/me/history/sync` | Sync account-backed watch-history state, tombstones and clear markers. |
| GET | `/api/v1/me/playback` | Restore one playback snapshot or list recent cross-media snapshots. |
| POST | `/api/v1/me/playback` | Save an account-owned Anime, Movies or administrator-only YouTube playback snapshot. |
| DELETE | `/api/v1/me/playback` | Delete one playback snapshot or clear snapshots for a selected media type. |

Library status values: `watching`, `plan_to_watch`, `completed`, `on_hold`, `dropped`.

All state-changing requests require a matching same-origin Origin or Referer. Validate finite non-negative playback values, enforce sensible duration/position bounds, and derive the owner only from the authenticated Kairo session. Never accept `userId` from a request body.

## 3c. YouTube playback and personal video library

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/youtube/videos/:videoId` | Retrieve administrator-only video metadata and the YouTube embed-allowed flag from the official Data API. |
| GET | `/api/v1/youtube/history` | List the signed-in user's recent YouTube playback history. |
| POST | `/api/v1/youtube/history` | Save or update playback progress for a video. |
| DELETE | `/api/v1/youtube/history/:videoId` | Remove one video from the signed-in user's history. |
| GET | `/api/v1/youtube/watch-later` | List the signed-in user's saved videos. |
| POST | `/api/v1/youtube/watch-later` | Save a video to Kairo Watch Later. |
| DELETE | `/api/v1/youtube/watch-later/:videoId` | Remove one video from Kairo Watch Later. |

- Video metadata is available only to the administrator; the API key remains server-side. The endpoint returns a normalized record, whether YouTube allows embedding, and the API-provided Made for Kids flag. Responses are private and non-cacheable. The watch page disables Kairo playback-history/progress tracking for videos YouTube marks Made for Kids. It does not return extracted stream URLs.
- History and Watch Later require a Kairo session and are scoped by the server-derived user ID. Write operations require a same-origin request, validate the video ID and bounded metadata/progress fields, and use per-user/IP write limits. Authenticated library responses are `Cache-Control: no-store`.
- The browser uses the official YouTube IFrame Player API. Kairo does not proxy video bytes, collect YouTube cookies, or bypass embed restrictions. If a video cannot be embedded, the UI offers the original YouTube watch URL.
- Playback progress is stored locally for guests and synced to D1 for signed-in Kairo users. This Kairo history is separate from the user's YouTube account history. Browser resume checkpoints are written every five seconds; signed-in cloud checkpoints are sent every 60 seconds, with immediate flushes on pause, completed seek, end, visibility loss, close, and player-setting/source changes. Failed writes are retained in a per-account local retry queue with exponential backoff. Each tab assigns a monotonically increasing sequence to its playback writes; the Worker uses server receive time and sequence checks to reject late writes from the same tab. Across separate tabs/devices, the most recently received valid write wins.
- The additive D1 schema is in `migrations/0011_youtube_media_library.sql`. Apply it to each target environment before deploying this Worker version. No remote migration is run by this source change.


## 4. Playback routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/anime/:id/episodes/:episodeNumber/servers` | Discover available language/server choices from the configured episode provider. In D1 catalogue mode, the stored title must have a supported AniList or MAL provider-ID mapping. |
| GET | `/api/v1/anime/:id/episodes/:episodeNumber/servers/:serverId/playback` | Resolve the selected opaque server ID through the configured provider and validate the returned URL against the playback host allowlist. |

A successful playback response may include:

```json
{
  "success": true,
  "data": {
    "provider": "approved-provider-id",
    "protocol": "hls",
    "manifestUrl": "https://approved.example/manifest.m3u8",
    "expiresAt": "2026-11-04T12:00:00Z",
    "subtitles": [
      { "language": "en", "label": "English", "url": "https://approved.example/subtitles/en.vtt", "format": "vtt" }
    ],
    "variants": [
      { "label": "1080p", "height": 1080 }
    ]
  }
}
```

The example is a schema illustration, not a live URL. Return only provider-authorized URLs and only fields the provider actually supplies. If no source is available, return `SOURCE_UNAVAILABLE` with a non-sensitive message.

## 5. Stable error codes

- `VALIDATION_ERROR` — invalid request input.
- `AUTH_REQUIRED` — no valid session.
- `FORBIDDEN` — authenticated but not authorized.
- `RESOURCE_NOT_FOUND` — missing record.
- `SOURCE_UNAVAILABLE` — authorized provider has no playable source.
- `PROVIDER_UNAVAILABLE` — provider timed out or returned an error.
- `CATALOG_UNAVAILABLE` — the catalogue database could not be read (HTTP 503).
- `RATE_LIMITED` — request limit reached.
- `INTERNAL_ERROR` — unexpected server error.

## 6. API behavior

- Use parameterized D1 statements.
- Apply pagination defaults and maximums on the server.
- Add request IDs to all responses and logs.
- Apply rate limits to login callbacks, search, and playback resolution where appropriate.
- Use `Cache-Control: no-store` on authenticated responses.
- Use explicit CORS origins only if the API is hosted on a separate origin. Same-origin deployment is preferred.
- Retry only idempotent reads, with bounded timeouts and backoff.



## 3c. Unified account media sync

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/me/history/sync?slug=:slug&episodeNumber=:number` | Restore one Anime episode's account-owned playback record before player initialization. Without the query pair, returns the latest account history. |
| POST | `/api/v1/me/history/sync` | Upsert account-owned Anime progress/history; accepts bounded items, per-episode deletion requests, and an explicit clear operation. |
| GET | `/api/v1/me/movies/library` | List the signed-in user's Movies provider references and saved-list state. `isFavorite` is always a JSON boolean. |
| POST | `/api/v1/me/movies/library` | Add/update a Movies Watchlist, Watched, Favorite or rating state. `isFavorite` is a JSON boolean in both request and response. Send status=null, isFavorite=false and rating=null to remove the record. |

- These routes derive user ownership exclusively from the validated HttpOnly Kairo session cookie. No user ID is accepted from the request body.
- Movie library rows store provider_id and external_id with the user's status/favorite/rating state. They do not ingest or copy TMDB metadata into the account library.
- Anime history deletes are recorded in tombstones, and history clear operations update a per-account clear marker. A stale offline client cannot recreate a row with an update timestamp older than the delete/clear marker.
- Guest Anime and Movies state is browser-only and is not sent to these routes. YouTube pages and their APIs are administrator-only; YouTube history and Watch Later use the routes in section 3b.
- Account records are common across all three media domains because the same Kairo session resolves to the same user_profiles.id. Domain tables and provider metadata remain separate.
- The additive schema is migrations/0013_unified_media_sync.sql. It is applied by the normal D1 migration step in the staging or production deployment workflow; PR verification does not modify a remote database.
