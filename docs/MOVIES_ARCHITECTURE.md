# Kairo Movies: catalogue foundation

Movies is a standalone product domain. It does not depend on Anime's `anime`, `episodes`,
`user_library`, `watch_progress`, AniList, Jikan, HiAnime, or anime episode/playback routes.
Only shared account identity and low-level application infrastructure may be reused.

## Current foundation

- D1 migration: `0012_movies_catalogue.sql`.
- Provider-neutral contracts: `worker/movies/types.ts`.
- Initial catalogue adapter: `worker/movies/providers/tmdb.ts`.
- Adapter tests: `worker/movies/providers/tmdb.test.ts`.

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

TMDB's current developer API policy says free access is for non-commercial use with attribution;
projects whose primary purpose is to generate revenue for the owner need a commercial licence.
The required product notice and approved logo also need to appear in Kairo's About/Credits area.
For that reason, `termsVerified` is false and this adapter must not be activated in production
until the owner has confirmed the applicable licence and branding requirements.

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

## Persistence rules

- Generate Kairo-owned IDs for `movies.id`; do not use a bare provider ID as the primary key.
- Store provider identifiers only in `movie_external_ids`, namespaced by provider.
- Keep movie user-library state in `user_movie_library`; do not reuse Anime's library table.
- Availability rows are region-scoped. They must never determine whether the movie appears
  in global search or discovery.
- Do not bulk-import or persist provider payloads until the provider's current licence and
  retention terms have been reviewed for Kairo's intended use.
- Do not treat metadata or availability links as authorisation to play a movie.

## Not wired yet

This foundation intentionally does not add Movies routes or change `worker/index.ts`.
The next step is to wire a Movies service and API routes, with provider activation gated by
owner-approved configuration and cache/persistence rules. The Noir UI can then consume a
stable Movies API without importing Anime catalogue types.
