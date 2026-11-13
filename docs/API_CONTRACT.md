# API contract — `/api/v1`

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
| GET | `/api/health` | Liveness probe (no dependencies) |
| GET | `/api/ready` | Readiness probe (verifies D1 is reachable; 503 `CATALOG_UNAVAILABLE` otherwise) |
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

## 3. Authenticated user routes

These routes require a valid identity-provider session/token and server-side ownership checks.

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

## 3a. Kairo-curated YouTube feed

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/youtube/channels/search?q=...` | Search public YouTube channels using the server-side API key. |
| GET | `/api/v1/youtube/videos/search?q=...` | Search public YouTube videos by keyword, with sort, duration and page-token filters. |
| GET | `/api/v1/youtube/channels` | List the user's channels saved in Kairo. |
| POST | `/api/v1/youtube/channels` | Add a public channel to the user's Kairo feed. |
| DELETE | `/api/v1/youtube/channels/:channelId` | Remove a channel from the user's Kairo feed. |
| GET | `/api/v1/youtube/feed` | Fetch recent public uploads from the user's saved Kairo channels. |

- Channel discovery, adding channels, loading the saved-channel feed, and saved-channel management require a valid Kairo session. Public keyword video search does not require a Kairo or YouTube account; guest searches are rate-limited by client IP and share the project's daily search quota. Public YouTube data uses the server-side `YOUTUBE_DATA_API_KEY`; users do not need to connect a YouTube/Google account.
- Kairo's channel list is stored separately in `youtube_feed_channels`; adding a channel does not subscribe the user to it on YouTube and does not change their YouTube subscriptions.
- Uses the official YouTube Data API with a Worker secret (`YOUTUBE_DATA_API_KEY`). The key is added only to server-to-server requests and is never returned to the browser or included in application logs. OAuth remains separate and optional for future account-specific features such as importing actual YouTube subscriptions.
- Kairo does not impose a maximum number of saved channels. Feed requests process up to 20 channels at a time, with up to four uploads per channel, to keep each Worker request within a predictable API-call budget. Each saved channel's uploads-playlist ID is persisted in D1 at add time; legacy saved channels are hydrated on their next feed request. Subsequent requests load older uploads from the next channel batch or the next page of each uploads playlist. Cursor state is stored in D1, scoped to the authenticated user, and expires after one hour.
- Channel searches are limited to five per user per 15 minutes; video searches are limited to eight per user per 15 minutes. Both share an 80-call rolling 24-hour project search budget, reserving headroom under YouTube's default 100-call daily `search.list` allowance. Video search supports relevance, upload-date, view-count and rating sort orders, duration filters, and page-token pagination. Each result page makes one batched `videos.list` request to enrich durations when the shared data-API budget permits; search results remain available if that optional enrichment fails. Feed page requests are limited to 30 per user per 15 minutes. Each playlist page consumes one shared data-API unit per channel; a one-time uploads-playlist lookup is also charged when an older saved channel has not yet been hydrated. Video metadata lookups share the same 8,000-unit project budget with channel additions, duration enrichment and feed requests. Feed responses use `Cache-Control: no-store`; video cards open the Kairo watch route with the official YouTube player and an external fallback.
- YouTube's public Data API does not expose a reliable Shorts classification flag or public source-video aspect ratio. Kairo therefore filters videos whose title or description explicitly contains a Shorts hashtag (`#short`, `#shorts`, `#youtubeshorts`); unlabelled Shorts cannot be guaranteed to be detected without relying on unsupported page scraping.
- Errors include `AUTH_REQUIRED`, `YOUTUBE_API_KEY_MISSING`, `YOUTUBE_API_KEY_INVALID`, `YOUTUBE_QUOTA_EXCEEDED`, `YOUTUBE_FEED_CURSOR_EXPIRED`, `RATE_LIMITED`, and `YOUTUBE_PROVIDER_UNAVAILABLE`.
- Kairo uses the official YouTube IFrame Player API for in-app playback and retains the official YouTube watch URL as a fallback. It does not proxy video streams.

## 3b. YouTube playback and personal video library

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/youtube/videos/:videoId` | Retrieve public video metadata and the YouTube embed-allowed flag from the official Data API. |
| GET | `/api/v1/youtube/history` | List the signed-in user's recent YouTube playback history. |
| POST | `/api/v1/youtube/history` | Save or update playback progress for a video. |
| DELETE | `/api/v1/youtube/history/:videoId` | Remove one video from the signed-in user's history. |
| GET | `/api/v1/youtube/watch-later` | List the signed-in user's saved videos. |
| POST | `/api/v1/youtube/watch-later` | Save a video to Kairo Watch Later. |
| DELETE | `/api/v1/youtube/watch-later/:videoId` | Remove one video from Kairo Watch Later. |

- Video metadata is public; the API key remains server-side. The endpoint returns a normalized record, whether YouTube allows embedding, and the API-provided Made for Kids flag. The watch page disables Kairo playback-history/progress tracking for videos YouTube marks Made for Kids. It does not return extracted stream URLs.
- History and Watch Later require a Kairo session and are scoped by the server-derived user ID. Write operations require a same-origin request, validate the video ID and bounded metadata/progress fields, and use per-user/IP write limits. Authenticated library responses are `Cache-Control: no-store`.
- The browser uses the official YouTube IFrame Player API. Kairo does not proxy video bytes, collect YouTube cookies, or bypass embed restrictions. If a video cannot be embedded, the UI offers the original YouTube watch URL.
- Playback progress is stored locally for guests and synced to D1 for signed-in Kairo users. This Kairo history is separate from the user's YouTube account history.
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

