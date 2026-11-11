# Live catalogue (AniList-first, with HiAnime and Jikan fallbacks)

KAIRO no longer needs a populated database to show titles. With `CATALOG_SOURCE="live"` (the default) every `/api/v1` catalogue route is answered live
from AniList first, then HiAnime and Jikan when the primary provider is unavailable. Search also tries the next provider when a healthy provider returns zero matches. Set `CATALOG_SOURCE="db"` to get the original D1 routes back. Paths and response shapes are the same in both modes.

## How a request is answered
1. Look in the cache (Workers KV `METADATA_CACHE` if bound, otherwise the edge cache, otherwise memory). Fresh entry: return it, no provider call.
2. Try providers in `LIVE_PROVIDERS` order. Local development and staging use `anilist,hianime,jikan`; production remains `anilist,jikan`. A per-provider circuit breaker skips a provider that is failing or rate limited.
3. On search, a successful empty result is not treated as an error: Kairo tries the next configured catalogue provider. A 404 from a direct title lookup remains final for that provider.
4. If every provider fails, an expired-but-recent cache entry is served with `meta.stale: true`. With nothing cached the API answers `503 PROVIDER_UNAVAILABLE`.
5. Data that came from a fallback provider is only treated as fresh for 5 minutes, so the primary is retried soon. Live cache keys include the configured provider order and a cache-version prefix, so changing catalogue providers cannot serve old cached IDs from a previous provider configuration.

Nothing is written to D1. Cache entries all expire (fresh 10 min to 24 h, stale copies at most 24 h, 7 days for the genre list), which keeps KAIRO inside AniList's rule against using its API as storage.

## Ids and slugs
`a1535` = AniList id, `m1535` = MyAnimeList id, and `h8` = legacy HiAnime id. AniList slugs look like `death-note-a1535`; older HiAnime slugs such as `attack-on-titan-8-h8` remain resolvable while HiAnime is configured as a catalogue fallback. AniList titles carry their MyAnimeList id, which lets the independent Jikan episode provider find their episode lists. HiAnime can also discover episodes using the resolved title and provider URL.

## What each provider does
| Route | AniList (primary) | HiAnime (catalogue fallback / legacy IDs) | Jikan (catalogue + episode fallback) |
|---|---|---|---|
| featured / trending / latest | trending, trending, airing newest-first. Featured prefers banner art and rotates its page/order daily | popular, top-airing, recently-updated | top airing, this season, airing newest-first |
| search and `/catalog/browse` | all filters, including AniList trending-score sorting and season/year combinations | title search and category browsing; filters applied when upstream fields are present | q, type, status, genre (id looked up), date range; no "hiatus" |
| genres | `GenreCollection` (no counts) | parses website genre links | `/genres/anime` (with counts) |
| detail | yes, includes banner | yes, including old `h…` identifiers | yes, no banner |
| related | relations + recommendations | related titles from the show page | recommendations |
| episodes | no | independent episode provider can discover by title / provider URL | independent episode provider can use the MyAnimeList id |

Trending and Seasonal are distinct views: Trending filters by season/year and sorts by AniList trending score; Seasonal uses the same filters sorted by popularity. Search also exposes a season filter.

Adult content is excluded everywhere: `isAdult: false` on AniList, `sfw=true` plus a drop of `Rx` ratings on Jikan, and Hentai/Erotica removed from genre lists.

## Configuration
`wrangler.jsonc` vars: `CATALOG_SOURCE` (`live` or `db`), `LIVE_PROVIDERS` (ordered catalogue priority), and `EPISODE_PROVIDERS` (independent episode-discovery priority).

Local development and staging use `LIVE_PROVIDERS=anilist,hianime,jikan`. AniList supplies canonical IDs and metadata first; HiAnime then Jikan provide fallbacks and keep existing HiAnime `h…` links resolvable. Production remains `anilist,jikan` until separately approved. Staging uses `EPISODE_PROVIDERS=hianime,jikan`; local development uses `jikan`. The separation is intentional: catalogue-provider selection does not change episode discovery or playback. HiAnime finds a title from its display/alternate titles or provider URL; Jikan uses the MyAnimeList ID mapped from an AniList record.

Bind a KV namespace as `METADATA_CACHE` on workers.dev; without it the cache does not persist between requests and you will hit rate limits quickly. KV's free tier allows 1,000 writes a day, and each cache miss is one write.

## Live spot-check log

- **2026-11-11 — Jikan anime detail:** a direct request to `GET https://api.jikan.moe/v4/anime/1` returned the expected v4 `data` object. The observed fields used by `mapJikanAnime` included `mal_id`, `url`, `images.jpg.large_image_url`, `title`, `title_english`, `title_japanese`, `title_synonyms`, `type`, `episodes`, `status`, `aired.prop.from.year`, `score`, `synopsis`, `rating`, `season`, `year`, and `genres[].name`. This is a spot-check of one detail response, not validation of every endpoint or every nullable field.
- The list/search, genre, seasonal archive, recommendations, and episode-list routes still need live checks against representative responses. Hand-written Vitest fixtures remain contract tests, not captured production payloads.
- Jikan's and MyAnimeList's applicable terms/licensing obligations have **not** been approved for KAIRO. Keep Jikan marked as an unverified fallback until the owner reviews those terms; do not treat its open-source software license as a license for MyAnimeList data.

## Owner actions before launch
- **First live check.** The adapters and tests use hand-written fixtures that follow the documented shapes. Call each route against the real APIs once and compare. In particular check Jikan's field names, the 25-item page limit, and the episodes page size.
- **Read Jikan's terms of use policy.** It has not been read yet. Jikan scrapes MyAnimeList, which may carry its own restrictions.
- **AniList rate limit.** Docs conflict between 90 and a degraded 30 requests per minute. Watch for 429s in the logs (`provider_failed`).
- AniList's rule that the name must not use "AniList" alone is respected (the app is KAIRO).
- Playback is unchanged: still no authorized provider, so the watch button stays disabled.
