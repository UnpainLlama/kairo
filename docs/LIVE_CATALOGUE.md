# Live anime catalogue (MyAnimeList-first)

KAIRO uses the official MyAnimeList API v2 as its first-choice live Anime catalogue source. AniList remains a compatibility fallback for older `a…` links and requests MAL cannot serve. HiAnime remains an optional legacy catalogue fallback for older `h…` links. Jikan is no longer in the default catalogue priority; it remains available as a separately configured compatibility source and as an independent episode-list provider.

The public API contract consumed by the React Anime pages is unchanged: `/catalog/*`, `/anime/:id`, `/anime/:id/related`, and `/anime/:id/episodes` continue returning KAIRO's normalized response shape.

## MyAnimeList API v2

- API base: `https://api.myanimelist.net/v2`
- Catalogue reads authenticate with `X-MAL-CLIENT-ID`. KAIRO reads the value from the Worker secret `MAL_CLIENT_ID`; it is never sent to the browser.
- Used endpoints: `GET /anime?q=…`, `GET /anime/:id`, `GET /anime/ranking`, and `GET /anime/season/:year/:season`.
- Search requests use a maximum page size of 100 and KAIRO requires at least 3 characters before sending a query to MAL (shorter queries fall through to the configured catalogue fallback). Ranking and season endpoints support up to 500 entries per request. KAIRO caps broad local filter scans at the first 500 results and does not advertise additional pages beyond that scanned window.
- Fields requested include alternate titles, synopsis (details), mean score, media type, airing status, dates/season, episode count, genres, NSFW grade, popularity/rank and main picture.
- Only HTTPS artwork from `cdn.myanimelist.net` is accepted. MAL does not provide the banner image field used by the old AniList hero cards; the UI falls back to poster artwork.
- KAIRO drops results whose MAL `nsfw` grade is not `white` (fail-closed when the grade is absent), and omits Hentai/Erotica genre labels. This filtering is performed locally because the API does not offer a dependable SFW query filter.

**Important API coverage limits:** MAL v2 has no standalone genre-directory endpoint and no general genre/status/year/order filter for catalogue search. KAIRO derives its genre selector and counts from the first 500 all-time ranked entries; those counts are sample counts, not MAL's total genre counts. Seasonal, genre, year, format and status combinations are filtered within a bounded window of up to 500 MAL ranking/search/season entries. When a season is selected without a year and no title query is present, MAL uses the current UTC calendar year; a title query plus season but no year filters the search results by season across the returned years. Search results are checked against returned titles and aliases because MAL can return non-matching titles for no-result queries. MAL also has no catalogue endpoint for episode lists or playable video streams.

MAL's API reference is published at https://myanimelist.net/apiconfig/references/api/v2. The API does not publish a numeric request-rate limit. KAIRO therefore applies a conservative per-isolate request pacer and relies on Workers KV caching; production use should be monitored for 403/429 responses. The public API is beta and the Client ID must be registered by the application owner. Review the MyAnimeList API License and Developer Agreement and any application notification/review requirements before public release.

## Request and cache flow

1. The Worker looks in `METADATA_CACHE` (Workers KV when bound; otherwise Cloudflare Cache API/memory).
2. It tries `LIVE_PROVIDERS` in order. Defaults are `mal,anilist`; local and staging configuration also include HiAnime for legacy identifiers.
3. A MAL outage or rate-limit error on browse/search routes causes the next configured catalogue source to be tried. Search/season requests with no valid MAL matches also allow fallback. New `m…` detail/related/episode requests require the MAL Client ID unless Jikan is separately enabled as a catalogue fallback; existing `a…` and `h…` IDs resolve through their respective configured providers. `/api/v1/providers` reports MAL as disabled and lists `mal:client_id_missing` until the secret is set.
4. If every source fails, a recent stale cache entry is served; without one, the route returns `503 PROVIDER_UNAVAILABLE`.
5. Live provider responses stay in expiring cache entries and are not written into D1.

Cache keys include the source order and a cache schema version (`live:v4`) so older provider-specific ids are not returned under the new primary order.

## IDs and compatibility

- `m1535` is a MyAnimeList anime ID. New MAL titles use this stable KAIRO id shape.
- `a1535` is an older AniList id. It remains resolvable only while AniList is configured.
- `h8` is a legacy HiAnime title id. It remains resolvable only while HiAnime catalogue fallback is configured.
- AniList records carry their MAL id where available. That MAL id continues to feed the independent Jikan episode-list adapter.
- Existing account history stores the KAIRO slug; no database migration is required for this provider switch.

## Catalogue, episodes and playback are separate

| Layer | Provider | Responsibility |
|---|---|---|
| Anime catalogue | MyAnimeList API v2 (primary) | Search, identity, title details, scores, rankings, seasonal charts and metadata |
| Catalogue compatibility | AniList; optional HiAnime | Old provider IDs and fallback catalogue results |
| Episode discovery | HiAnime and/or Jikan via `EPISODE_PROVIDERS` | Episode numbers, labels, language/server choices |
| Anime playback | `KairoMediaPlayer` and dedicated `AnimeEmbedPlayer` | HLS/file playback or a sandboxed anime-provider iframe |
| Movie playback | `MovieEmbedPlayer` + CineSrc | Movie-only embed path, addressed by TMDB movie ID |

MAL does not supply episode streams or an embed player. Changing the catalogue provider does not change `EPISODE_PROVIDERS`, approved playback hosts, or the Anime iframe. Anime's generic provider iframe is implemented in `src/components/AnimeEmbedPlayer.tsx`; the Movie CineSrc iframe remains isolated in `src/components/MovieEmbedPlayer.tsx`.

## Configuration

Set `LIVE_PROVIDERS` in `wrangler.jsonc` to choose catalogue priority. The defaults are now:

- Local development: `mal,anilist,hianime`
- Staging: `mal,anilist,hianime`
- Production configuration remains `anilist,jikan` until the MAL Client ID and applicable terms have been reviewed; not deployed by this change

Provide a registered Client ID in a gitignored local `.dev.vars` file or Worker secret:

```sh
# Local .dev.vars
MAL_CLIENT_ID="your-own-registered-client-id"

# Cloudflare staging secret (run together with the owner during setup)
npx wrangler secret put MAL_CLIENT_ID --env staging
```

Do not put the value in `wrangler.jsonc`, `.env`, Vite variables or any committed file. Production secret provisioning is a separate approved step. This GitHub change does not set Cloudflare secrets, deploy Workers, or change remote D1/KV.

Episode discovery remains independently configured: local uses `EPISODE_PROVIDERS=jikan`; staging uses `hianime,jikan`. Jikan's terms remain unverified for catalogue or episode usage; keep it disabled unless the owner has reviewed the applicable terms.

## Verification still required

The MAL adapter has deterministic fixture tests, but it has not yet been live-verified with KAIRO's own registered Client ID. After the secret is provisioned in a controlled staging session, verify search, a direct detail lookup, ranking, a seasonal chart and recommendation fields, and inspect provider 403/429/error metrics. No remote test or deployment has been performed in this code change.
