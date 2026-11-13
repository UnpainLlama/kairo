# Kairo Movies: catalogue foundation

Movies is a standalone product domain. It does not depend on Anime's `anime`, `episodes`,
`user_library`, `watch_progress`, AniList, Jikan, HiAnime, or anime episode/playback routes.
Only shared account identity and low-level application infrastructure may be reused.

## Current foundation

- D1 migration: `0012_movies_catalogue.sql`.
- Provider-neutral contracts: `worker/movies/types.ts`.
- Initial catalogue adapter: `worker/movies/providers/tmdb.ts`.
- Adapter tests: `worker/movies/providers/tmdb.test.ts`.
- Cached request orchestration: `worker/movies/service.ts`.
- D1 upsert and local search: `worker/movies/repository.ts`.
- API routes: `worker/index.ts` under `/api/v1/movies/*`.
- Repository/service tests: `worker/movies/repository.test.ts` and `worker/movies/service.test.ts`.

The migration adds canonical movie records, namespaced external IDs, genres, credits,
a standalone user movie library, and country-scoped availability offers. A movie remains
globally discoverable even if it has no availability offers for a user's country.

## Provider boundaries

### Catalogue and metadata

The `MovieCatalogProvider` contract covers discovery, search, detail lookups, and genres.
The initial TMDB adapter supports:

- trending today and this week;
- popular, top-rated, upcoming, and now-playing lists;
- search and year/genre/original-language filters;
- movie details, external IMDb ID, genres, production countries, languages, cast and crew.

The adapter deliberately omits region/watch-region filters from catalogue calls. Locale is
only used to select display language and does not limit which countries' films are listed.

TMDB's developer API is free for non-commercial use with attribution. The project owner
confirmed on 2026-11-13 that Kairo is a personal, non-commercial website. Kairo's `/about`
page displays a TMDB logo and the required notice:
"This product uses the TMDB API but is not endorsed or certified by TMDB."
The adapter's `termsVerified` flag records that approval. Keep staging enabled for this
personal-use scope; do not enable commercial or revenue-generating use without a separate
TMDB commercial licence.

The TMDB Read Access Token must be stored as a Cloudflare Worker secret named
`TMDB_ACCESS_TOKEN`. It must never be shipped to the React client.

### Availability

Availability is not catalogue membership and is not playback. An availability offer records
the selected region, service, monetisation type, format/quality, price/currency, and an outbound
service URL. It never stores a stream URL.

`MovieAvailabilityProvider` is the extension point for JustWatch or another contracted
availability service. JustWatch's Content Partner API requires a concluded partner contract
and partner token, and its partner docs require JustWatch-branded links next to availability
integrations. No JustWatch adapter is enabled until Kairo has partner access and the live
response schema/contract has been reviewed.

## Global search and ingestion

The Movies API now exposes:

- `GET /api/v1/movies/discover?kind=trending_week&page=1` for global discovery.
- `GET /api/v1/movies/search?q=dune&page=1` for provider-backed global search.
- `GET /api/v1/movies/genres?language=en-US` for genre metadata.
- `GET /api/v1/movies/:externalId` for detail metadata.
- `GET /api/v1/movies/catalogue/search?q=dune` for the locally ingested D1 catalogue.
- `POST /api/v1/movies/ingest` for a bounded, admin-only page ingestion (one page, capped at page 10).
- `POST /api/v1/movies/ingest/:externalId` for admin-only detail ingestion including genres and credits.

The provider service uses short-lived KV/memory caching, provider timeouts and stale-on-error
responses. Global catalogue endpoints omit country/watch-region filters. Country is relevant
only to the separate availability data, not catalogue visibility.

All provider endpoints require the server-side Wrangler vars
`MOVIES_TMDB_ENABLED=true` and `MOVIES_TMDB_TERMS_APPROVED=true`. Staging opts in to
read-only TMDB discovery/search; local development and production remain off by default.
The separate `MOVIES_INGESTION_ENABLED` flag remains false in every environment and also
requires an authenticated Kairo administrator session. The adapter is not activated by
simply supplying a TMDB token.

The initial ingestion operation is deliberately incremental: one selected discovery page
per request, and one detail record per request. It is not a TMDB database mirror or unbounded
background crawler. Search itself is live and cached; it does not silently persist search
results. This keeps provider retention and data-licence review separate from read-only search.

## Persistence rules

- Generate Kairo-owned IDs for `movies.id`; do not use a bare provider ID as the primary key.
- Store provider identifiers only in `movie_external_ids`, namespaced by provider.
- Keep movie user-library state in `user_movie_library`; do not reuse Anime's library table.
- Availability rows are region-scoped. They must never determine whether the movie appears
  in global search or discovery.
- Do not bulk-import or persist provider payloads until the provider's current licence and
  retention terms have been reviewed for Kairo's intended use.
- Do not treat metadata or availability links as authorisation to play a movie.

## Noir frontend

The Movies workspace is routed independently in `src/App.tsx`:

- `/movies`: cinematic Noir home with a featured backdrop and horizontal rails for trending, popular, top-rated, upcoming, and now-playing films.
- `/movies/browse/:category`: paginated collections, including genre-specific discovery.
- `/movies/search?q=...`: global movie search results.
- `/movies/:externalId`: movie details, cast, crew and genre links.

The Movies workspace reuses Kairo's existing fixed navigation rail, persistent search bar,
menu popover and mobile navigation. Only their context-specific destinations and labels
change while the user is in Movies. The shared search component switches to the Movies
search API and never calls the Anime catalogue in Movies mode. Movie cards and all page
types use the independent Movies API contracts in `src/lib/movies.ts`.

## Current boundary

The Movies API and frontend are wired independently of Anime and YouTube. Existing Anime
route handlers and response contracts are unchanged. Staging enables read-only TMDB discovery
for the owner's confirmed personal, non-commercial use and displays TMDB attribution on
`/about`. The ingestion flag remains off pending a separate review of durable retention.
The D1 migration is applied by the staging deployment workflow; production remains disabled
and untouched.
