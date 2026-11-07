# Live catalogue (HiAnime staging, Jikan and AniList) and episode/server discovery

KAIRO no longer needs a populated database to show titles. With `CATALOG_SOURCE="live"` (the default) every `/api/v1` catalogue route is answered live
from the providers in `LIVE_PROVIDERS` (staging configures HiAnime first and Jikan as fallback). Episode lists and server labels are handled separately by `EPISODE_PROVIDERS`. Set `CATALOG_SOURCE="db"` to get the original D1 routes back. Paths and response shapes are the same in both modes.

## How a request is answered
1. Look in the cache (Workers KV `METADATA_CACHE` if bound, otherwise the edge cache, otherwise memory). Fresh entry: return it, no provider call.
2. Try providers in `LIVE_PROVIDERS` order (default `anilist,jikan`). A per-provider circuit breaker skips one that is failing or rate limited.
3. A missing title (404) is final. It does not fall through to the next provider.
4. If every provider fails, an expired-but-recent cache entry is served with `meta.stale: true`. With nothing cached the API answers `503 PROVIDER_UNAVAILABLE`.
5. Data that came from a fallback provider is only treated as fresh for 5 minutes, so the primary is retried soon.

Episode discovery is separate: `EPISODE_PROVIDERS` is tried in priority order. When the title originated from HiAnime, its retained slug is used directly; otherwise HiAnime exact-matches a search result before reading the episode list. On upstream failure, Jikan is tried when a MyAnimeList ID is known. Episode pages are cached in KV for up to 24 hours. The episode-list endpoint does not call server/source or media-proxy endpoints. The separate server-discovery route calls only the documented server-list endpoint and returns labels/IDs, never media sources.

Nothing is written to D1. Cache entries all expire (fresh 10 min to 24 h, stale copies at most 24 h, 7 days for the genre list), which keeps KAIRO inside AniList's rule against using its API as storage.

## Ids and slugs
`a1535` = AniList id, `m1535` = MyAnimeList id, `h8` = HiAnime numeric id. A HiAnime slug such as `death-note-8-h8` retains the original `death-note-8` website slug. Catalogue providers can supply cross-provider IDs; episode providers receive the title, alternate titles and known external IDs. They are configured independently.

## What each provider does
| Route | AniList | Jikan | HiAnime |
|---|---|---|---|
| featured / trending / latest | trending, trending, airing newest-first. Featured prefers titles with banner art | top airing, this season, airing newest-first | most popular, top airing, recently updated |
| search and `/catalog/browse` | all filters | q, type, status, genre (id looked up), date range; no "hiatus" | search page; common categories and best-effort card filters |
| genres | `GenreCollection` (no counts) | `/genres/anime` (with counts) | reads genre links from homepage |
| detail | yes, includes banner | yes, no banner | `/watch/:slug` HTML detail page |
| related | relations + recommendations | recommendations | related cards parsed from detail page |
| episodes | separate service | separate service | `/api/theme/episode/list/:id` |
| server labels | n/a | n/a | `/api/theme/episode/servers?episodeId=...` |

Adult content is excluded everywhere: `isAdult: false` on AniList, `sfw=true` plus a drop of `Rx` ratings on Jikan, and Hentai/Erotica removed from genre lists.

## Configuration
`wrangler.jsonc` vars: `CATALOG_SOURCE` (`live` or `db`), `LIVE_PROVIDERS` for catalogue providers, and `EPISODE_PROVIDERS` for episode discovery. The staging experiment sets both `LIVE_PROVIDERS` and `EPISODE_PROVIDERS` to `hianime,jikan`; development remains Jikan-only and production retains AniList/Jikan catalogue with Jikan episodes. `HIANIME_BASE_URL` must use one of the adapter's fixed HTTPS allowlisted mirrors. Bind a KV namespace as `METADATA_CACHE` on workers.dev; without it the cache does not persist between requests and you will hit rate limits quickly. KV's free tier allows 1,000 writes a day, and each cache miss is one write.

HiAnime is not terms-verified. Keep it in staging only until its terms and permission for use are confirmed. The adapter supports catalogue pages, episode lists and server labels. Source URL extraction/decryption and media proxying are not implemented.

## Owner actions before launch
- **First live check.** The adapter tests use hand-written fixtures, and runtime smoke tests used mocked responses. Call the staging routes against the live upstream and compare: featured, search, detail, episode list, and `/episodes/:episodeNumber/servers`. Confirm the HTML and JSON response shapes before considering production.
- **Read Jikan's terms of use policy.** It has not been read yet. Jikan scrapes MyAnimeList, which may carry its own restrictions.
- **Review HiAnime terms and permission.** Its public endpoints are reverse-engineered and the supplied docs do not establish permission for commercial reuse. Do not enable it in production until reviewed.
- **AniList rate limit.** Docs conflict between 90 and a degraded 30 requests per minute. Watch for 429s in the logs (`provider_failed`).
- AniList's rule that the name must not use "AniList" alone is respected (the app is KAIRO).
- Playback is unchanged: still no authorized provider, so the watch button stays disabled.

## HiAnime staging adapter

The supplied CloudStream `.cs3` package identifies `https://hianime.at` as its base domain and contains these discovery endpoints: `GET /search?keyword=...&page=...`, `GET /api/theme/episode/list/{numericAnimeId}`, and `GET /api/theme/episode/servers?episodeId={providerEpisodeId}`. The catalogue adapter reads the site's public category/search/detail HTML. The episode adapter returns episode records and server labels only. It does not call `/stream/getSources`, MegaPlay extractors, or any playback/source endpoint. The client tries `hianime.at` first, then the fixed fallback mirror list. A 200 response can still be a challenge page or a changed HTML shape, so staging must be tested against live responses.

HiAnime IDs use the `h` prefix, for example `death-note-8-h8`; the embedded `death-note-8` slug is retained so details and episodes do not need a second title search. HiAnime terms and reuse permissions are unverified. Keep it staging-only until reviewed.
