# KAIRO — TMDB artwork and metadata setup

This update adds TMDB as an independent artwork and metadata-enrichment provider. HiAnime remains the catalogue/episode provider selected by `LIVE_PROVIDERS` and `EPISODE_PROVIDERS`; TMDB does not change anime IDs, episode discovery, server discovery, or playback. In live mode, TMDB can fill missing synopsis, rating, genres, release year, and total episode count after a title match. Existing non-empty catalogue metadata takes precedence. The enrichment applies to the live catalogue path; the legacy `CATALOG_SOURCE=db` routes do not use this TMDB artwork service.

## 1. Create a TMDB API Read Access Token

Create an API application in your TMDB account and copy its **API Read Access Token** (Bearer token). Do not use the short API key in this setting. Keep the token private.

## 2. Set the Cloudflare Worker secret

From the Kairo repository root, run:

```bash
npx wrangler secret put TMDB_ACCESS_TOKEN --env staging
```

Paste the API Read Access Token when Wrangler prompts for it. Do not add it to `wrangler.jsonc`, `.env`, committed files, or GitHub source code. For production, only configure the secret after confirming the project's licence permits that use:

```bash
npx wrangler secret put TMDB_ACCESS_TOKEN --env production
```

## 3. Local development

Create or update the gitignored `.dev.vars` file in the repository root:

```dotenv
TMDB_ACCESS_TOKEN="your-tmdb-api-read-access-token"
```

Do not commit `.dev.vars`.

## 4. Verify after deployment

Open:

- `/api/ready` — `artworkProvider` should report `tmdb` when the secret is present.
- `/api/v1/providers` — `artworkProvider.enabled` should be `true`.
- `/api/v1/catalog/featured` — inspect card artwork and missing synopsis, rating, genres, release year and episode count.
- `/api/v1/anime/<slug>` — inspect the full enriched card, including `releaseYear`.
- `/api/v1/anime/<slug>/metadata` — inspect `synopsis`, `rating`, `episodeCount`, `genres`, image URLs, and TMDB source/provider attribution.

If the secret is absent, invalid, or TMDB is rate-limiting requests, the catalogue still works and keeps upstream artwork and metadata. The first request for an uncached title may take longer while TMDB is queried; matches are cached for 30 days, misses for 7 days, and errors for 5 minutes.

## 5. Artwork behavior

- TMDB TV search is used for series, OVA, ONA and specials; movie search is used for films.
- Matching considers the title, up to two alternate titles and release year.
- Search-result poster/backdrop paths are preferred. If either is missing, the corresponding TV/movie image endpoint is queried for an alternate poster or backdrop.
- After a confident title match, the TV/movie details endpoint is queried for overview, rating, named genres, release year, and (for TV) total episode count. Search-result values remain fallbacks if the details request is unavailable.
- TMDB fills missing catalogue metadata; existing non-empty synopsis, rating, genres, year, and episode count remain unchanged. A missing value is represented as `null` or an empty genre list in Kairo, but this is a fallback result—not a replacement for the TMDB request.
- Poster URLs use the `w500` image size; landscape backdrops use `w1280`.
- Only TMDB's HTTPS image CDN URLs are accepted.
- A portrait poster is not stretched into a hero backdrop. When there is no landscape artwork, the UI keeps its dark fallback treatment.

## 6. Attribution and usage terms

TMDB requires its logo and this notice in an About/Credits area:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

The TMDB developer API is offered for non-commercial use with attribution. Commercial use requires a separate licence from TMDB. Review the current terms for your use case before enabling this in a commercial deployment.

Official references:

- https://developer.themoviedb.org/docs/getting-started
- https://developer.themoviedb.org/docs/authentication-application
- https://developer.themoviedb.org/reference/search-tv
- https://developer.themoviedb.org/reference/tv-series-images
- https://developer.themoviedb.org/docs/image-basics
- https://www.themoviedb.org/faq/api


## Episode stills

The Worker also enriches live episode rows with TMDB season stills. It resolves the matched TV series, selects a season using an explicit season number in the catalogue title when available and otherwise the nearest season air year, then reads `still_path` from the TV season details response. The episode API returns these as `thumbnailUrl`. If an episode has no TMDB still, Kairo falls back to the series backdrop or poster. This is optional: a TMDB lookup failure never prevents episode discovery.
