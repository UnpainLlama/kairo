# Metadata and playback providers

## Movies provider boundary

Kairo Movies uses TMDB for discovery, search, details, genres, artwork and numeric identifiers. CineSrc is the sole Movie playback provider and receives the TMDB movie ID. See [CineSrc setup](CINESRC_SETUP.md) and [the official CineSrc docs](https://cinesrc.st/docs).

## Anime provider boundary

The live Anime catalogue uses **MyAnimeList API v2 for metadata** and **TMDB for visual artwork only**.

| Role | Provider | Responsibilities |
|---|---|---|
| Catalogue metadata | MyAnimeList API v2 | Search, title identity, alternate titles, synopsis, format, airing status, season/year, episode count, genres and MAL score |
| Posters and hero images | TMDB | Poster and backdrop URLs; optional episode still thumbnails |
| Episode discovery | Jikan, HiAnime | Episode lists and provider episode identifiers |
| Playback | Existing Anime player and approved embed boundary | Server discovery and playback resolution |

MAL images are deliberately ignored. TMDB cannot supply or overwrite synopsis, rating, genres, season, release year, format, status or episode count. No provider is assumed to supply another provider's role.

The catalogue is fail-closed: if the Worker secret MAL_CLIENT_ID is missing, the active catalogue provider list is empty and live catalogue routes return 503. There is no secondary metadata provider or fallback.

## 1. MyAnimeList API v2

- Base URL: https://api.myanimelist.net/v2.
- Public catalogue reads are made by the Worker with the X-MAL-CLIENT-ID request header. The Client ID must be a Worker secret, never a browser variable.
- Create a Kairo application through [MyAnimeList API settings](https://myanimelist.net/apiconfig). Review and comply with the current API License and Developer Agreement, including any application notice or review conditions, before public release.
- Kairo uses anime ranking, seasonal anime, search and title detail/recommendations.
- MAL has no separate trending endpoint in this integration: Kairo uses popularity ranking for the Trending collection.
- "Latest" is a list of current-season titles ordered by start date. MAL does not provide a global latest-episodes feed.
- MAL has no standalone genre directory. Kairo derives genre filter choices from a bounded sample of ranked results; it is not a complete genre index.
- A fixed numeric request limit was not verified. Kairo uses a one-second per-isolate request pacer, handles HTTP 429 / Retry-After and caches responses. The pacer is not a globally shared rate budget across Worker isolates.
- The adult-content filter fails closed: entries without the expected safe nsfw grade, or with an RX rating, are excluded.
- MAL supplies metadata only. It is not used for episode extraction or streams.

The adapter is worker/live/mal.ts; regression fixtures are in worker/live/mal.test.ts. They are hand-authored fixtures, not captured live responses. A passing build does not prove the registered Client ID is accepted by MAL.

## 2. TMDB artwork

The Anime artwork adapter matches a MAL title to a TMDB TV or movie result using title variants, release year and format. A confident match supplies only posterUrl (w500), bannerUrl (w1280) and optional episode stills (w780).

The Worker may read TMDB detail and image endpoints to locate the right artwork, but the adapter returns only the TMDB ID, media type and image URLs. Kairo merges only poster and banner URLs into the MAL record. It never takes synopsis, rating, genres, year or episode count from TMDB.

Artwork is optional and fails open: TMDB failures do not make a MAL catalogue request fail. Successful matches are cached for 30 days, no-match results for 7 days and failures for 5 minutes. Episode stills are separately cached. Images are hotlinked from image.tmdb.org; Kairo does not re-host them.

TMDB requires attribution. Its developer API is free for non-commercial use with attribution; commercial use requires a separate licence. Use the TMDB logo as required and show this notice in the application's About/Credits area:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

See the [official TMDB FAQ](https://developer.themoviedb.org/docs/faq), [Getting Started](https://developer.themoviedb.org/docs/getting-started) and [API authentication guide](https://developer.themoviedb.org/docs/authentication-application).

## 3. Independent episode and playback services

Jikan and HiAnime remain independent episode-discovery providers configured by EPISODE_PROVIDERS. They do not supply catalogue cards or metadata fallbacks. The MAL ID on a catalogue title is passed into episode lookup as the cross-provider identifier.

The ZokoAnime helper, when explicitly enabled, builds only the documented MAL-ID iframe route. It does not call a private JSON API, fetch iframe content, extract media URLs, proxy streams or trust postMessage events. It remains disabled by default pending owner review of the provider terms and player event contract.

## 4. Legacy D1 metadata enrichment

The separate legacy CATALOG_SOURCE=db metadata route remains provider-neutral. It reads the stored D1 title row, then optionally enriches it using providers selected by METADATA_PROVIDERS. That variable is blank in the committed Wrangler config.

- Kitsu remains implemented in worker/metadata/providers/kitsu.ts, but is off by default; its terms and rate limits have not been verified from a primary source.
- The manami adapter is a dataset mapper, not a live API. Its import path checks each dataset release's licence and accepts only ODbL-1.0.
- The legacy metadata registry contains no retired catalogue adapter.

The merge priorities in worker/metadata/merge.ts rank Kitsu ahead of the stored manami snapshot when Kitsu is explicitly enabled. This is separate from the live MAL catalogue and is not a fallback for it.

## 5. Configuration

Configure these as Cloudflare Worker secrets in each environment:

| Secret | Purpose |
|---|---|
| MAL_CLIENT_ID | Required for the live Anime catalogue. Register your own application at [MAL API settings](https://myanimelist.net/apiconfig). |
| TMDB_ACCESS_TOKEN | Required for TMDB Anime artwork and enabled Movies discovery. |

Example commands:

    npx wrangler secret put MAL_CLIENT_ID --env staging
    npx wrangler secret put TMDB_ACCESS_TOKEN --env staging

Do not add either value to wrangler.jsonc, frontend source, .env.example with a real value, or a committed file. In local development use gitignored Wrangler .dev.vars.

With no MAL_CLIENT_ID, /api/ready can still verify Worker/D1 readiness but reports an empty catalogue providers array, and live catalogue endpoints fail with 503. Do not deploy the new live catalogue to a target where the MAL secret is not configured and tested.

## 6. Caching, identifiers and persistence

Live catalogue records and artwork lookups use the short-lived provider cache. Live provider metadata is not written to D1. D1 continues to hold user accounts, library references, watch history and shared Anime/Movies/YouTube playback state. No schema migration is required for this provider switch.

New live Anime IDs use MAL references such as m1535 and slugs such as death-note-m1535. Existing historical a... user-library references are retained as legacy stored identifiers so existing account rows are not silently deleted; they do not invoke a catalogue or network provider. Migration 0026 rebuilds the library-reference constraint around the legacy, MAL and HiAnime namespaces, converts old provider mappings to the inert legacy namespace, and removes the retired provider's data-source registration. Earlier migration files remain unchanged so already-applied migration history stays valid.

## 7. First live check

The MAL adapter tests use controlled fixtures. The live Client ID, actual MAL response shape, TMDB token, artwork match quality and current upstream availability still require verification in the target environment.

After the MAL secret is registered:
1. Verify /api/ready reports providers: ["mal"] and configured episode providers separately.
2. Verify /api/v1/providers lists MAL as the only catalogue provider and TMDB as artwork provider.
3. Test /api/v1/catalog/featured, /api/v1/catalog/trending, /api/v1/catalog/latest, /api/v1/catalog/search and /api/v1/catalog/browse.
4. Test a title detail route and confirm synopsis, score, genres, year and episode count are from MAL, while poster and banner URLs point to image.tmdb.org.
5. Test Jikan/HiAnime episode discovery separately. A valid MAL response does not prove episode discovery or playback is available.
