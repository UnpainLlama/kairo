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
| GET | `/api/health` | Minimal public liveness probe (no dependencies); only public Access path override |
| GET | `/api/ready` | Minimal public readiness probe (verifies D1/schema; 503 if unavailable); only public Access path override. Detailed dependency fields are omitted when Access enforcement is enabled. |
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

## 2b. Provider routes (added; existing routes unchanged)

| Route | Purpose |
|---|---|
| `GET /api/v1/providers` | Metadata providers: enabled flag, `termsVerified`, capabilities, attribution. Also `unknownConfigured` for names in `METADATA_PROVIDERS` that no adapter handles. |
| `GET /api/v1/anime/:id/metadata` | Unified record for a title (id or slug): the stored row merged with enabled providers. Adds `provenance`, `conflicts`, `ids`, `sources` and `providers` (per-provider outcome: `ok`, `cached`, `not_found`, `skipped`, `failed`). `meta.degraded` is true when any enabled provider failed. A provider failure never fails the request; the stored row is always the floor. Errors: `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, `CATALOG_UNAVAILABLE`. |

Ratings are on a 0-10 scale. See docs/PROVIDERS.md.

## 3a. Administrator routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/admin/bootstrap` | One-time administrator provisioning; requires `ADMIN_BOOTSTRAP_TOKEN` and is disabled after an admin exists. |
| GET | `/api/v1/admin/console-path` | Return the current 30-minute console path to an authenticated administrator only. |
| GET | `/api/v1/admin/accounts` | List standard accounts, their unique Cloudflare Access email bindings, and the 15-account allocation count. |
| POST | `/api/v1/admin/accounts` | Create a standard username/password account bound to one approved Access email while below the cap. |
| PATCH | `/api/v1/admin/accounts/:id/access-email` | Change a standard account's unique Access email and revoke its sessions. |
| PATCH | `/api/v1/admin/accounts/:id/status` | Suspend or reactivate a standard account. |
| POST | `/api/v1/admin/accounts/:id/password` | Reset a standard account password and revoke its active sessions. |

All administrator routes verify the session role server-side. The console path is an obscurity layer, not an authentication mechanism. A staging Cron Trigger rotates it every 30 minutes. The database enforces a single administrator role; suspended standard accounts continue to count toward the 15-account allocation limit.

## 3. Authenticated user routes

Kairo uses closed access: public standard-account registration and Google sign-in are disabled. Cloudflare Access is the outer staging entrance and is configured with exact individual email addresses, not a Gmail-domain wildcard. The Worker verifies the signed Cloudflare Access application JWT (signature, issuer, audience and token times), then checks that its verified email maps to an active Kairo profile on every API request. Each Kairo account and session is bound to that verified Access email. A Kairo username/password is required for personal features; invited visitors may browse the catalogue without entering Kairo credentials; their email must still be assigned to an active Kairo profile.

Standard accounts are created by an administrator with a username, password, and unique approved Access email. Changing the assigned email revokes all sessions for that account. The Cloudflare Access allowlist must be maintained separately by the operator.

The single administrator is created once through `POST /api/v1/admin/bootstrap`, protected by the temporary `ADMIN_BOOTSTRAP_TOKEN` Worker secret and current verified Access identity. The endpoint also records permanent bootstrap completion in D1. Administrator login uses username/password and creates an eight-hour session; standard-account sessions retain the existing 30-day lifetime. Five incorrect administrator passwords within the one-hour failure window lock the administrator login until manually cleared in the staging D1 console.

Authentication routes:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/login` | Sign in using username/password matched to the current verified Access email. Administrator sessions last eight hours; standard sessions last 30 days. |
| POST | `/api/v1/admin/bootstrap` | One-time administrator creation; requires the `X-Kairo-Bootstrap` header and the current verified Access email; permanently disabled after initialization. |

The bootstrap token is temporary and should be removed from the staging Worker secrets immediately after successful administrator setup. Passwords are stored as salted PBKDF2 hashes; plaintext passwords are never stored. The current administrator authentication intentionally has no Kairo MFA; see `docs/CLOSED_ACCESS_SETUP.md` for outstanding production security work and the manual lockout recovery procedure.

These routes require a valid Kairo session and server-side ownership checks.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/me` | Current profile |
| PATCH | `/api/v1/me` | Update editable profile fields |
| GET | `/api/v1/me/preferences` | Read preferences |
| PUT | `/api/v1/me/preferences` | Replace validated preferences |
| GET | `/api/v1/me/library` | Read library, filter by status |
| PUT | `/api/v1/me/library/:animeId` | Add or update a library item |
| DELETE | `/api/v1/me/library/:animeId` | Remove a library item |
| GET | `/api/v1/me/history` | Read recent viewing history |
| DELETE | `/api/v1/me/history` | Clear history after explicit confirmation |
| GET | `/api/v1/me/progress` | Read episode progress |
| PUT | `/api/v1/me/progress/:episodeId` | Upsert playback progress |

Library status values: `watching`, `plan_to_watch`, `completed`, `on_hold`, `dropped`.

Progress request example:

```json
{
  "positionSeconds": 523,
  "durationSeconds": 1420,
  "completed": false
}
```

Validate finite non-negative numbers, enforce sensible duration/position bounds, and derive the subject ID from the authenticated context. Never accept `userId` from the request body.

| GET | `/api/v1/me/playback?mediaType=...&mediaKey=...` (mediaType: anime, movie or youtube) | Restore one shared playback snapshot. Omit `mediaKey` to list recent cross-media playback (optional `mediaType`, `limit`). |

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/youtube/channels/search?q=...` | Administrator-only YouTube channel search. |
| GET | `/api/v1/youtube/videos/search?q=...` | Administrator-only YouTube video search. |
| GET | `/api/v1/youtube/channels` | List the user's channels saved in Kairo. |
| POST | `/api/v1/youtube/channels` | Add a public channel to the user's Kairo feed. |
| DELETE | `/api/v1/youtube/channels/:channelId` | Remove a channel from the user's Kairo feed. |
| GET | `/api/v1/youtube/feed` | Fetch recent public uploads from the user's saved Kairo channels. |

- Every YouTube page and API route, including metadata, keyword search, channel search, feed, OAuth connection, playback history and Watch Later, requires a valid administrator session. Anonymous visitors and standard accounts receive a not-found response. The restriction is enforced in the Worker, not only in the frontend.
- Kairo's channel list is stored separately in `youtube_feed_channels`; adding a channel does not subscribe the user to it on YouTube and does not change their YouTube subscriptions.
- Uses the official YouTube Data API with a Worker secret (`YOUTUBE_DATA_API_KEY`). The key is added only to server-to-server requests and is never returned to the browser or included in application logs. OAuth is an administrator-only optional connection for future account-specific features such as importing actual YouTube subscriptions.
- Kairo does not impose a maximum number of saved channels. Feed requests process up to 20 channels at a time, with up to four uploads per channel, to keep each Worker request within a predictable API-call budget. Each saved channel's uploads-playlist ID is persisted in D1 at add time; legacy saved channels are hydrated on their next feed request. Subsequent requests load older uploads from the next channel batch or the next page of each uploads playlist. Cursor state is stored in D1, scoped to the authenticated user, and expires after one hour.
- Channel searches are limited to five per user per 15 minutes; video searches are limited to eight per user per 15 minutes. Both share an 80-call rolling 24-hour project search budget, reserving headroom under YouTube's default 100-call daily `search.list` allowance. Video search supports relevance, upload-date, view-count and rating sort orders, duration filters, and page-token pagination. Each result page makes one batched `videos.list` request to enrich durations when the shared data-API budget permits; search results remain available if that optional enrichment fails. Feed page requests are limited to 30 per user per 15 minutes. Each playlist page consumes one shared data-API unit per channel; a one-time uploads-playlist lookup is also charged when an older saved channel has not yet been hydrated. Video metadata lookups share the same 8,000-unit project budget with channel additions, duration enrichment and feed requests. Feed responses use `Cache-Control: no-store`; video cards open the Kairo watch route with the official YouTube player and an external fallback.
- YouTube's public Data API does not expose a reliable Shorts classification flag or public source-video aspect ratio. Kairo therefore filters videos whose title or description explicitly contains a Shorts hashtag (`#short`, `#shorts`, `#youtubeshorts`); unlabelled Shorts cannot be guaranteed to be detected without relying on unsupported page scraping.
- Errors include `AUTH_REQUIRED`, `YOUTUBE_API_KEY_MISSING`, `YOUTUBE_API_KEY_INVALID`, `YOUTUBE_QUOTA_EXCEEDED`, `YOUTUBE_FEED_CURSOR_EXPIRED`, `RATE_LIMITED`, and `YOUTUBE_PROVIDER_UNAVAILABLE`.
- Kairo uses the official YouTube IFrame Player API for in-app playback and retains the official YouTube watch URL as a fallback. It does not proxy video streams.

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
| GET | `/api/v1/episodes/:episodeId/playback` | Resolve playback through an authorized configured provider |

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
| GET | `/api/v1/me/movies/library` | List the signed-in user's Movies provider references and saved-list state. |
| POST | `/api/v1/me/movies/library` | Add/update a Movies Watchlist, Watched, Favorite or rating state. Send status=null, isFavorite=false and rating=null to remove the record. |

- These routes derive user ownership exclusively from the validated HttpOnly Kairo session cookie. No user ID is accepted from the request body.
- Movie library rows store provider_id and external_id with the user's status/favorite/rating state. They do not ingest or copy TMDB metadata into the account library.
- Anime history deletes are recorded in tombstones, and history clear operations update a per-account clear marker. A stale offline client cannot recreate a row with an update timestamp older than the delete/clear marker.
- Guest Anime and Movies state is browser-only and is not sent to these routes. YouTube pages and their APIs are administrator-only; YouTube history and Watch Later use the routes in section 3b.
- Account records are common across all three media domains because the same Kairo session resolves to the same user_profiles.id. Domain tables and provider metadata remain separate.
- The additive schema is migrations/0013_unified_media_sync.sql. It is applied by the normal D1 migration step in the staging or production deployment workflow; PR verification does not modify a remote database.
