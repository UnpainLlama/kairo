# Live anime catalogue (AniList-first)

KAIRO uses the public AniList GraphQL API as its first-choice live anime catalogue. AniList supplies catalogue identity, titles, alternate titles, synopsis, scores, genres, cover posters and landscape banner artwork. It also provides native seasonal and genre filters, so the Seasonal, Trending and Discover pages use the same full catalogue rather than a bounded sample from a different provider.

MAL is a secondary compatibility provider. It can fill in when AniList is unavailable and can be used as a text-search fallback when AniList returns no matches. A successful empty AniList result for a season or genre is treated as authoritative; KAIRO does not replace an empty seasonal or discovery result with a partially scanned MAL result. HiAnime remains an optional catalogue fallback for legacy `h…` IDs. Jikan is not in the default catalogue order; it remains an independently configured episode-list provider and can be explicitly enabled as a catalogue compatibility source.

The public API contract consumed by the React Anime pages remains unchanged: `/catalog/*`, `/anime/:id`, `/anime/:id/related` and `/anime/:id/episodes` return KAIRO's normalized response shape.

## AniList catalogue and discovery

- API: `https://graphql.anilist.co`; public catalogue reads require no API key.
- KAIRO requests only the fields used by its cards and detail pages, including `coverImage` and `bannerImage`. Featured home cards prefer landscape banners and rotate the lineup daily.
- Seasonal browsing uses AniList's native `season` and `seasonYear` arguments. The Seasonal page supports search, genre, format, status and sort filters against the selected season/year.
- Trending uses `TRENDING_DESC` with the selected season and year. It is not MAL's popularity ranking.
- Discover loads its genre choices from AniList's `GenreCollection` and loads each collection using native `genre` filtering with `POPULARITY_DESC`.
- Available sort mappings are relevance (`SEARCH_MATCH` when a query is present), popularity (`POPULARITY_DESC`), trending (`TRENDING_DESC`), latest (`START_DATE_DESC`) and rating (`SCORE_DESC`).
- Adult catalogue entries are excluded with AniList's `isAdult: false` filter and checked again when mapping the response.
- AniList does not publish genre counts from `GenreCollection`; KAIRO leaves these as zero/unknown rather than inventing counts.

The service uses bounded page sizes, a provider circuit breaker, request timeouts and expiring cache entries. AniList's published guidance has described a normal rate limit of 90 requests/minute and temporary degraded periods at 30 requests/minute; 429 responses are handled as provider failures and trigger fallback. Provider responses are never written to D1. The current cache scope includes the configured provider order, so switching primary providers creates a fresh cache namespace.

## MyAnimeList compatibility fallback

- API base: `https://api.myanimelist.net/v2`.
- Catalogue reads authenticate with `X-MAL-CLIENT-ID`, using the Worker secret `MAL_CLIENT_ID`. It is never sent to the browser.
- MAL is not a replacement for AniList's seasonal and discovery features: its API has no standalone genre directory and lacks several general search filters. KAIRO limits broader local filtering to a bounded set of MAL results.
- Only HTTPS artwork from `cdn.myanimelist.net` is accepted. MAL does not supply AniList's banner artwork field.
- KAIRO drops MAL results unless the NSFW grade is explicitly `white`.
- When configured, MAL is tried after AniList failures and after empty text-search results. It is not tried merely because a valid AniList season/genre browse returns no results.
- If `MAL_CLIENT_ID` is absent, MAL fallback calls fail closed while AniList remains fully usable.

A MAL Client ID may be stored locally in the gitignored `.dev.vars` file or as a Cloudflare Worker secret:

```sh
# Local .dev.vars
MAL_CLIENT_ID="your-own-registered-client-id"

# Cloudflare staging secret
npx wrangler secret put MAL_CLIENT_ID --env staging
```

Do not put the value in `wrangler.jsonc`, `.env`, Vite variables or committed source. Review MyAnimeList's API License and Developer Agreement before public release.

## IDs and compatibility

- `a1535` is an AniList ID and is the normal ID shape for new catalogue results.
- `m1535` is a MyAnimeList ID; MAL can resolve these IDs directly and AniList can resolve them by `idMal` when available.
- `h8` is a legacy HiAnime title ID and remains resolvable only while HiAnime is configured.
- AniList records carry a MAL ID when available. That ID feeds the independent Jikan episode-list adapter.
- Existing account history stores the KAIRO slug; the provider-priority change does not require a database migration.

## Catalogue, episodes and playback are separate

| Layer | Provider | Responsibility |
|---|---|---|
| Anime catalogue | AniList (primary) | Search, title identity, banner/poster artwork, details, genres, seasonal charts and discovery |
| Catalogue compatibility | MAL; optional HiAnime | Search fallback, MAL IDs and legacy HiAnime IDs |
| Episode discovery | HiAnime and/or Jikan via `EPISODE_PROVIDERS` | Episode numbers, labels, language/server choices |
| Anime playback | `KairoMediaPlayer` and `AnimeEmbedPlayer` | HLS/file playback or a sandboxed anime-provider iframe |
| Movie playback | `MovieEmbedPlayer` + CineSrc | Movie-only embed path, addressed by TMDB movie ID |

Changing catalogue priority does not change `EPISODE_PROVIDERS`, approved playback hosts or playback. HiAnime/Jikan episode discovery remains separate from AniList metadata.

## Configuration

The local and staging defaults are:

- Local development: `anilist,mal,hianime`
- Staging: `anilist,mal,hianime`
- Production template: `anilist,jikan` (production remains separately gated and has not been changed by this update)

`LIVE_PROVIDERS` controls catalogue order; `EPISODE_PROVIDERS` independently controls episode lookup. AniList needs no secret. MAL is an optional fallback and needs `MAL_CLIENT_ID`. TMDB artwork enrichment is also independent and runs only when `TMDB_ACCESS_TOKEN` is configured.

## Verification

CI tests exercise the AniList query builder and its seasonal sort/filter variables, GenreCollection discovery, provider ordering and the rule that a valid empty AniList season/genre result is not replaced by MAL/Jikan data. These use hand-written fixtures, not live provider responses. After deployment, verify `/api/v1/providers`, `/api/v1/catalog/genres`, a seasonal browse request and a discovery browse request while authenticated through Cloudflare Access.
