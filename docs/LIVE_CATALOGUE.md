# Live catalogue (AniList + Jikan)

KAIRO no longer needs a populated database to show titles. With `CATALOG_SOURCE="live"` (the default) every `/api/v1` catalogue route is answered live
from AniList, with Jikan (MyAnimeList) as the fallback. Set `CATALOG_SOURCE="db"` to get the original D1 routes back. Paths and response shapes are the same in both modes.

## How a request is answered
1. Look in the cache (Workers KV `METADATA_CACHE` if bound, otherwise the edge cache, otherwise memory). Fresh entry: return it, no provider call.
2. Try providers in `LIVE_PROVIDERS` order (default `anilist,jikan`). A per-provider circuit breaker skips one that is failing or rate limited.
3. A missing title (404) is final. It does not fall through to the next provider.
4. If every provider fails, an expired-but-recent cache entry is served with `meta.stale: true`. With nothing cached the API answers `503 PROVIDER_UNAVAILABLE`.
5. Data that came from a fallback provider is only treated as fresh for 5 minutes, so the primary is retried soon.

Nothing is written to D1. Cache entries all expire (fresh 10 min to 24 h, stale copies at most 24 h, 7 days for the genre list), which keeps KAIRO inside AniList's rule against using its API as storage.

## Ids and slugs
`a1535` = AniList id, `m1535` = MyAnimeList id. Slugs are `death-note-a1535`. Only the trailing id matters. AniList titles carry their MyAnimeList id, which is how episodes (Jikan only) and Jikan recommendations work for them.

## What each provider does
| Route | AniList | Jikan |
|---|---|---|
| featured / trending / latest | trending, trending, airing newest-first. Featured prefers titles with banner art | top airing, this season, airing newest-first |
| search and `/catalog/browse` | all filters | q, type, status, genre (id looked up), date range; no "hiatus" |
| genres | `GenreCollection` (no counts) | `/genres/anime` (with counts) |
| detail | yes, includes banner | yes, no banner |
| related | relations + recommendations | recommendations |
| episodes | no | yes (provider page size, client `limit` ignored) |

Adult content is excluded everywhere: `isAdult: false` on AniList, `sfw=true` plus a drop of `Rx` ratings on Jikan, and Hentai/Erotica removed from genre lists.

## Configuration
`wrangler.jsonc` vars: `CATALOG_SOURCE` (`live` or `db`), `LIVE_PROVIDERS` (`anilist,jikan`, `jikan,anilist`, or a single one), and `EPISODE_PROVIDERS` (configured independently).

KAIRO's local and staging catalogue priority is `anilist,jikan`: AniList supplies the canonical catalogue IDs and metadata, while Jikan is the fallback for catalogue list/search requests. Staging keeps `EPISODE_PROVIDERS=hianime,jikan`; local development uses Jikan for episodes. This separation is intentional: selecting AniList for the catalogue does not change episode discovery or playback. HiAnime finds a title from its display/alternate titles; Jikan uses the MyAnimeList ID mapped from the AniList record.

Bind a KV namespace as `METADATA_CACHE` on workers.dev; without it the cache does not persist between requests and you will hit rate limits quickly. KV's free tier allows 1,000 writes a day, and each cache miss is one write.

## Owner actions before launch
- **First live check.** The adapters and tests use hand-written fixtures that follow the documented shapes. Call each route against the real APIs once and compare. In particular check Jikan's field names, the 25-item page limit, and the episodes page size.
- **Read Jikan's terms of use policy.** It has not been read yet. Jikan scrapes MyAnimeList, which may carry its own restrictions.
- **AniList rate limit.** Docs conflict between 90 and a degraded 30 requests per minute. Watch for 429s in the logs (`provider_failed`).
- AniList's rule that the name must not use "AniList" alone is respected (the app is KAIRO).
- Playback is unchanged: still no authorized provider, so the watch button stays disabled.
