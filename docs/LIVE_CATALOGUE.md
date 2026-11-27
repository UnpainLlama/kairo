# Live Anime catalogue (MyAnimeList API v2)

KAIRO's live Anime catalogue uses the official MyAnimeList (MAL) API v2. MAL is the single catalogue provider for list pages, discovery, search, genres, title details and recommendations. TMDB is a separate service and the **only source of anime imagery**: posters, backdrops, banners and episode stills. MAL artwork URLs are never requested or rendered.

The live routes keep the existing API response shapes so the Anime pages can share one backend contract. Set `CATALOG_SOURCE="db"` only to use the older D1 catalogue routes.

## Page-to-provider mapping

| KAIRO page / feature | API request | MAL behavior |
|---|---|---|
| Anime home / featured rail | `GET /api/v1/catalog/featured` | MAL's currently-airing ranking |
| Trending | `GET /api/v1/catalog/browse?season=…&year=…&sort=trending` | Seasonal chart ordered by MAL list-user popularity; MAL does not expose a trending-score feed |
| Seasonal | `GET /api/v1/catalog/browse` | MAL seasonal endpoint; supports season, year, format, status, genre, search and rating/popularity sorting |
| Discover | `GET /api/v1/catalog/genres` and `/api/v1/catalog/browse?sort=popularity&genre=…` | Genre counts derived from a bounded top-ranking sample; browse results are MAL popularity-ranked |
| Search | `GET /api/v1/catalog/search?q=…` | Official MAL anime search, followed by KAIRO's bounded filter/sort pass |
| Recently updated | `GET /api/v1/catalog/latest` | Current-season titles ordered by MAL start date; MAL has no catalogue update-feed endpoint |
| Anime details | `GET /api/v1/anime/:id` and `/metadata` | MAL title, synopsis, alternate titles, score, format, status, season, episode count and genres; TMDB resolves artwork |
| Related titles | `GET /api/v1/anime/:id/related` | MAL recommendations |
| Watch page | `GET /api/v1/anime/:id`, `/episodes`, `/episodes/:episode/servers` | MAL resolves the anime identity and supplies its MAL ID to the separate episode-discovery service. TMDB supplies anime poster/backdrop and episode still imagery. MAL does not provide episode listings or playable streams. |

All new live Anime IDs and slugs use the MAL namespace: `m1535` and `death-note-m1535`. Legacy AniList (`a…`) and HiAnime (`h…`) identifiers remain syntactically parseable, but are not resolvable by the active MAL-only catalogue. Existing saved links using those identifiers need a separate ID migration or cross-reference before they can work again.

## Request and data handling

1. A fresh short-lived cache entry is returned first. Workers KV is used when `METADATA_CACHE` is bound; otherwise the existing cache fallback is used.
2. Cache misses call the official MAL API through the Worker. The Client ID is sent in the `X-MAL-CLIENT-ID` header and is never sent to the browser.
3. Requests are paced at approximately one per 1.1 seconds per Worker isolate. A circuit breaker handles repeated provider failures and 429 responses.
4. Search/filter operations are bounded: title search scans at most five 100-row pages; ranking and seasonal filtering use a maximum 500-row window. MAL does not expose exact totals for every endpoint, so totals may be omitted.
5. Provider responses are cached with expiry and are not written to D1. A stale cached response may be served if the provider is unavailable.
6. MAL's NSFW field is fail-closed: only `nsfw=white` records are included, and RX-rated entries are excluded. Hentai/Erotica genres are omitted.

The `trending` sort is intentionally mapped to MAL popularity within a season. It is not an AniList-style trending score. `latest` means latest start date in the current season, not recently edited MAL entries.

## Artwork: TMDB only

- MAL supplies no image URLs to KAIRO's mapper. The adapter intentionally returns `posterUrl=null` and `bannerUrl=null`.
- Every uncached anime card is eligible for TMDB artwork matching, even when MAL's descriptive metadata is complete.
- TMDB resolves poster and backdrop images from its TV/movie search, detail and image endpoints. Matching uses title alternatives, year and media type to avoid weak matches.
- TMDB season stills are used for watch-page episode thumbnails. Episode-provider thumbnail URLs are discarded; when a still is unavailable, KAIRO uses the TMDB series backdrop/poster or leaves the image empty.
- TMDB enrichment fails open. If the TMDB token is missing, unavailable or returns no confident match, the catalogue metadata still renders but artwork may be absent. There is deliberately no MAL/AniList/HiAnime/Jikan image fallback.

## Configuration

`wrangler.jsonc` sets `LIVE_PROVIDERS=mal` in development, staging and production configuration. The live catalogue is pinned to MAL; old provider names in the compatibility variable do not activate them.

Required secrets:

- `MAL_CLIENT_ID`: register an API client with MyAnimeList, then set locally in `.dev.vars` or with `npx wrangler secret put MAL_CLIENT_ID --env staging`. Configure production separately only after reviewing the MyAnimeList API License and Developer Agreement.
- `TMDB_ACCESS_TOKEN`: required for Anime artwork and Movies features. Configure as a Worker secret, not a Wrangler `vars` value.

Episode discovery/playback remains independent and is still controlled by `EPISODE_PROVIDERS`, HiAnime settings and the playback host allowlist. This catalogue change does not certify or replace those providers. In particular, MAL does not supply episode feeds, servers or streams. A working Anime detail page does not guarantee that the Watch page can obtain episodes or playback.

## Verification status

The adapter tests use hand-written fixtures matching the documented MAL API v2 response shape; they are contract tests, not captured live responses. Before enabling this branch in a deployed environment:

- Verify the Client ID is active and the API Developer Agreement permits KAIRO's intended use.
- Check MAL search, ranking, seasonal, details and recommendations against live responses.
- Check that the staging Worker has both `MAL_CLIENT_ID` and `TMDB_ACCESS_TOKEN` secrets.
- Verify representative TMDB artwork matches, especially sequels, movies and titles with alternate English/Japanese names.
- Verify episode discovery and playback separately; they are not supplied by MAL.
