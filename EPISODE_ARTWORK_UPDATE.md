# Kairo episode artwork update

This is a focused patch for the current TMDB artwork integration. Extract the archive into the existing Kairo repository root and allow these files to overwrite their matching paths.

## What it changes

- Adds an optional episode-artwork field to the internal episode record.
- Extends the TMDB provider to resolve a TV series season and load episode still images from the season details endpoint.
- Selects an explicit season number from titles such as `Kaiju No. 8 Season 2`; when the title has no season number, uses the closest season air year, then falls back to the first regular season.
- Adds cached episode-still enrichment with request coalescing and timeouts.
- Uses the matched series backdrop or poster when a specific episode still is unavailable.
- Returns the resolved image URL as `thumbnailUrl` from the existing live episodes endpoint.
- Adds tests for season selection, still URL mapping, service caching, and the live episode route.

## Files in this patch

- `worker/metadata/types.ts`
- `worker/artwork/tmdb.ts`
- `worker/artwork/service.ts`
- `worker/artwork/tmdb.test.ts`
- `worker/artwork/service.test.ts`
- `worker/live/service.ts`
- `worker/live/handlers.ts`
- `worker/live/live.test.ts`
- `TMDB_ARTWORK_SETUP.md`

## Configuration

No new secret is required. It uses the existing Cloudflare Worker secret `TMDB_ACCESS_TOKEN` already configured for TMDB artwork. Do not put the token in source code, `wrangler.jsonc`, or frontend files.

## Important limitations

TMDB does not necessarily have still images for every anime episode. When an episode still is unavailable, Kairo displays the series backdrop or poster as a fallback. If the series is not confidently matched, episode discovery still succeeds and retains the original placeholder rather than attaching unrelated artwork.

The current code assumes Kairo's episode numbers are season-local. Explicit season titles and season release years are used to map split seasonal titles. Long-running shows whose HiAnime episode numbering spans several TMDB seasons may need a dedicated cross-season episode-number mapping later.

## Verification performed

- Targeted TypeScript check for the changed Worker modules passed.
- Mocked TMDB smoke test passed for search → TV details → season details → episode still URLs.
- Mocked live `/api/v1/anime/:id/episodes` route returned the episode thumbnail URLs.
- Full Vitest suite and production build were not run in this environment because dependency installation did not complete.
- No GitHub push or Cloudflare deployment was performed.
