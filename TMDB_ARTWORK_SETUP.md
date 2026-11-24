# KAIRO — TMDB artwork-only setup

The live Anime catalogue uses MyAnimeList API v2 for all title metadata. TMDB is used only for visual assets: portrait posters, landscape hero/backdrop images and optional episode still thumbnails. TMDB never supplies or overwrites synopsis, rating, genres, season, year, format, airing status or episode count.

The same TMDB_ACCESS_TOKEN secret is also used by the separate Movies catalogue when that feature is enabled.

## 1. Create a TMDB API Read Access Token

Create an API application in your TMDB account and copy its API Read Access Token (Bearer token). The official guide is https://developer.themoviedb.org/docs/authentication-application. Keep the token private.

TMDB's developer API is free for non-commercial use with attribution. Commercial use requires a separate licence. Read TMDB's current FAQ and Terms before using the service in a public or commercial deployment:
- https://developer.themoviedb.org/docs/faq
- https://developer.themoviedb.org/docs/getting-started

## 2. Set the Cloudflare Worker secret

From the Kairo repository root:

    npx wrangler secret put TMDB_ACCESS_TOKEN --env staging

Paste the API Read Access Token when Wrangler prompts. Do not add it to wrangler.jsonc, .env.example, frontend code or GitHub source. For production, configure the token only after verifying the intended use is permitted and the environment is approved.

## 3. MAL metadata prerequisite

Anime catalogue cards are supplied by MyAnimeList API v2. The Worker must also have a separately configured MAL_CLIENT_ID secret; see https://myanimelist.net/apiconfig. Without it, the Anime catalogue intentionally reports no active catalogue provider and returns 503. The TMDB token does not replace the MAL credential.

## 4. Image behavior

- MAL image fields are ignored.
- Kairo searches TMDB TV for series, OVA, ONA and specials; films use TMDB movie search.
- Candidate artwork is matched using title variants, year and format. Low-confidence matches are ignored.
- TMDB poster images use w500; landscape backdrops use w1280.
- If search/details do not return a usable image for a slot, the matching TMDB image collection is checked for an alternate.
- Episode stills are sourced from TMDB season data and returned as thumbnailUrl; if a still is missing, the episode card can use the series backdrop or poster.
- Only TMDB's HTTPS image CDN URLs are accepted.
- TMDB errors are non-fatal. MAL metadata remains usable even when artwork lookup fails.
- Successful artwork matches are cached for 30 days, no-match results for 7 days and failures for 5 minutes. Episode stills are cached separately.

## 5. Verify after deployment

Once both secrets are configured in staging:

- /api/ready should report providers: ["mal"] and artworkProvider: "tmdb".
- /api/v1/providers should show MAL as the only catalogue metadata provider, episode providers separately, and TMDB as the artwork provider.
- /api/v1/catalog/featured should return MAL metadata with poster/backdrop URLs hosted at image.tmdb.org.
- /api/v1/anime/<m-id> should keep MAL synopsis, rating, genres, release year and episode count, with only poster and banner filled from TMDB.
- /api/v1/anime/<m-id>/episodes should continue to use the configured episode providers and may include TMDB still thumbnails.

## 6. Attribution

TMDB requires its logo and this notice in an About/Credits area:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

Use the official TMDB logo without modification: https://www.themoviedb.org/about/logos-attribution.

## Movie playback boundary

TMDB supplies Movies discovery and metadata; it is not a playback provider. CineSrc remains Kairo's sole Movie playback provider. See docs/CINESRC_SETUP.md.
