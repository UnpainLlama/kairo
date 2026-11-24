# Live anime catalogue (AniList-only, Japanese-origin)

Kairo's live Anime catalogue uses **only the public AniList GraphQL API** at `https://graphql.anilist.co`. Every catalogue list, featured card, search, seasonal query, trending query, genre browse, direct title lookup and related-title query is restricted to `countryOfOrigin: JP` and excludes adult entries.

There is no MAL, Jikan or HiAnime catalogue fallback. If AniList is unavailable, Kairo reports the catalogue as unavailable or serves a still-valid cached AniList response; it does not substitute another catalogue. The live catalogue cache namespace was advanced so results previously cached from mixed-provider responses cannot be reused.

## AniList catalogue and discovery

- API: `https://graphql.anilist.co`; public reads require no API key.
- Kairo uses GraphQL POST requests from the Worker. The browser calls Kairo's `/catalog/*` and `/anime/:id` endpoints; it does not call AniList directly.
- Queries request only the fields used by cards and detail pages, including titles, descriptions, genres, cover posters and landscape banners.
- `countryOfOrigin: JP` is applied at the API query and checked again when mapping results. Chinese-origin and other non-Japanese titles are excluded from the catalogue.
- Adult entries are excluded with `isAdult: false` and checked again when mapping results.
- Seasonal browsing uses AniList's native `season` and `seasonYear` arguments. Trending uses `TRENDING_DESC`. Discover loads genre choices from `GenreCollection` and filters by genre using AniList.
- Sort mappings: relevance (`SEARCH_MATCH` when a query is present), popularity (`POPULARITY_DESC`), trending (`TRENDING_DESC`), latest (`START_DATE_DESC`) and rating (`SCORE_DESC`).
- AniList does not publish per-genre counts from `GenreCollection`; Kairo leaves them unknown rather than inventing counts.

Kairo uses bounded page sizes, request timeouts, a provider circuit breaker and expiring cache entries. Provider responses are not written to D1. AniList guidance has described a normal rate limit of 90 requests/minute and temporary degraded periods at 30 requests/minute; 429 responses are surfaced as provider failures.

## Episode discovery is separate

The catalogue provider does not provide episode lists or playback streams. Staging keeps the independent `EPISODE_PROVIDERS=hianime,jikan` configuration:

- HiAnime supplies episode records and server discovery/playback resolution.
- Jikan supplies episode-list compatibility where configured.
- AniList's `idMal` value is retained internally only as an external identifier bridge for Jikan and the optional ZokoAnime embed URL. Kairo does not call the MyAnimeList API, and no MAL catalogue adapter or `MAL_CLIENT_ID` secret is required.
- Older `m1234` title references can still be resolved by AniList through its `idMal` query argument. New catalogue results use AniList IDs (`a1234`).

Jikan/HiAnime episode services do not affect the Home page, Trending, Seasonal, Discover or search catalogue. Their episode data is not used as anime catalogue cards.

## Artwork enrichment

TMDB artwork enrichment is independent of catalogue identity. When `TMDB_ACCESS_TOKEN` is configured, it may fill missing poster/backdrop artwork, synopsis, rating, genres, year and episode count after a confident title match. It does not replace AniList, add titles or supply episode lists or playback. Existing AniList metadata takes precedence.

## Configuration

- `CATALOG_SOURCE=live` selects the live catalogue routes.
- The live catalogue is hard-wired to AniList; the old `LIVE_PROVIDERS` override has been removed.
- `EPISODE_PROVIDERS` independently controls episode discovery. Staging remains `hianime,jikan`.
- AniList needs no secret. The MAL catalogue API credential has been removed.
- TMDB artwork enrichment is optional and runs only when `TMDB_ACCESS_TOKEN` is configured.

## Verification

CI tests cover the AniList query builder, Japanese-origin and adult filters, seasonal sorting, GenreCollection discovery, direct title filtering, single-provider reporting and the independent Jikan episode route. These use controlled fixtures, not live AniList responses. After deployment, verify `/api/v1/providers`, `/api/v1/catalog/genres`, a seasonal browse request and a discovery browse request. The provider list should contain exactly one catalogue item: `anilist`.
