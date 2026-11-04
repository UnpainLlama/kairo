# API contract — `/api/v1`

All routes are same-origin behind the Cloudflare Worker unless a deployment architecture explicitly separates the API. Use JSON and UTF-8. Query values must be validated and bounded.

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
| GET | `/api/health` | Basic health probe |
| GET | `/api/v1/catalog/featured` | Featured titles |
| GET | `/api/v1/catalog/trending?page=1&limit=24` | Trending titles |
| GET | `/api/v1/catalog/latest?page=1&limit=24` | Recently updated titles |
| GET | `/api/v1/catalog/search?q=...&page=1&limit=24` | Search |
| GET | `/api/v1/catalog/genres` | Available genres |
| GET | `/api/v1/anime/:id` | Anime details |
| GET | `/api/v1/anime/:id/episodes?page=1&limit=50` | Episodes |
| GET | `/api/v1/anime/:id/related` | Related titles |

Search parameters:
- `q`: trimmed string, 2–100 characters.
- `page`: integer 1–500.
- `limit`: integer 1–50; default 24.
- Optional filters: `genre`, `year`, `format`, `status`, `season`, `sort`.
- Reject invalid sort keys rather than interpolating them into SQL.

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
