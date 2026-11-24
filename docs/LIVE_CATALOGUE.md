# Live Anime Catalogue

KAIRO uses the official MyAnimeList API v2 for Anime catalogue metadata and The Movie Database (TMDB) exclusively for visual artwork.

## Providers

- **Metadata:** MyAnimeList API v2 (`https://api.myanimelist.net/v2`), requested by the Worker using the server-side `MAL_CLIENT_ID` secret.
- **Artwork:** TMDB search and image endpoints, requested by the Worker using `TMDB_ACCESS_TOKEN`. Posters use TMDB poster images; hero backgrounds use TMDB backdrops; episode cards may use TMDB episode stills.
- **Episodes:** Jikan and HiAnime remain independent episode-discovery providers. The catalogue provider does not supply streams or playback URLs.

When `MAL_CLIENT_ID` is absent, the live catalogue reports no active providers and catalogue requests fail closed with 503. There is no AniList or other catalogue fallback.

## MAL API behaviour

- Featured titles use MAL's airing ranking.
- Trending is represented by MAL popularity ranking; MAL API v2 does not expose a separate trending feed.
- Seasonal browsing uses `/anime/season/{year}/{season}`.
- Search uses `/anime?q=...`; search results are narrowed through a bounded result window for genre, format, year and status filters.
- MAL does not expose a standalone genre directory. KAIRO derives genre choices from a bounded scan of ranking results, not a complete genre index.
- The API does not publish a fixed numeric request limit. KAIRO spaces requests using a shared per-isolate pacer, handles rate-limit errors, and caches responses in Workers KV.
- The adult filter fails closed: entries without the expected safe `nsfw` grade, or with an RX rating, are excluded.

## Artwork

MAL image fields are ignored. KAIRO matches catalogue titles to TMDB TV/movie records using title variants, release year and format. TMDB provides posters, backdrops and available episode stills only. It does not overwrite MAL's synopsis, score, genres, release year, format, status or episode count.

## IDs and persistence

New live catalogue IDs use MAL references such as `m1535` and `death-note-m1535`. Live catalogue metadata is held in the short-lived provider cache, not written to D1. User accounts, libraries, and shared Anime/Movies/YouTube playback progress retain their existing D1 schema and identifiers.

## Configuration

Register a KAIRO application at [MyAnimeList API settings](https://myanimelist.net/apiconfig) and add its Client ID as a Cloudflare Worker secret named `MAL_CLIENT_ID`. Configure `TMDB_ACCESS_TOKEN` as a separate Worker secret for artwork. Never put either secret in browser code, Wrangler vars, or committed source.

Review the MAL API license and developer agreement and TMDB's non-commercial API terms/attribution requirements before production use.
