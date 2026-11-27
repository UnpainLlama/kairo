# Metadata and playback providers

## Movies provider boundary

KAIRO Movies has two distinct provider roles:

| Role | Provider | Responsibility |
|---|---|---|
| Catalogue and metadata | TMDB | Discovery, search, movie details, genres, artwork and numeric TMDB identifiers |
| Playback | CineSrc | The single Movie iframe player, addressed with the TMDB movie ID |

CineSrc is the only Movie playback provider. It does not replace the TMDB catalogue API.

## Anime provider boundaries

Anime catalogue metadata, artwork, episode discovery and playback are separate services.

| Role | Provider | Responsibility |
|---|---|---|
| Catalogue and title identity | Official MyAnimeList API v2 | Featured/ranked lists, seasonal charts, search, genres, title details and recommendations |
| Anime artwork | TMDB | The exclusive source of posters, backdrops, banners and episode stills |
| Episode discovery | Separately configured episode providers | Episode records and provider episode IDs; not supplied by MAL |
| Playback | Separately configured playback resolver | Approved server discovery and playback response; not supplied by MAL or TMDB |

MAL is the sole live Anime catalogue source. The Worker uses a server-side `MAL_CLIENT_ID` header and does not expose it to browser code. MAL does not provide KAIRO's artwork, episode feeds or playable streams.

## Artwork rules

- Anime catalogue adapters must not supply image URLs to the UI. The MAL mapper explicitly returns null poster and banner fields.
- Every uncached Anime title can be resolved against TMDB, even when MAL's text metadata is complete.
- TMDB is the only allowed source for anime posters, backdrops, banners and episode thumbnails.
- TMDB matching uses title alternatives, year and media type. Low-confidence matches are ignored.
- Episode-provider thumbnail URLs are discarded. TMDB season stills are used where available; otherwise the TMDB series backdrop/poster is used, or the image remains empty.
- TMDB artwork failures do not make catalogue requests fail. If `TMDB_ACCESS_TOKEN` is missing or a confident match cannot be found, text metadata remains available without artwork.
- TMDB may also fill missing descriptive metadata fields through the existing enrichment layer; it does not change MAL identity, episode lists or playback.

## MyAnimeList API constraints and launch gate

The implementation uses official API v2 read endpoints for anime search, ranking, seasonal lists, details and recommendations. Search scans are bounded, requests are paced conservatively, responses are short-lived cached and provider content is not written to D1.

**The MyAnimeList API License and Developer Agreement still require owner review for KAIRO's intended use before public release.** The API Client ID must be registered by the owner and configured as a Worker secret:

```bash
npx wrangler secret put MAL_CLIENT_ID --env staging
```

Set it separately for production only after the agreement has been reviewed and production rollout has been approved. Do not add the Client ID to `wrangler.jsonc`, Vite variables or source code.

## TMDB configuration and attribution

Store the TMDB API Read Access Token as the Worker secret `TMDB_ACCESS_TOKEN`. It is used by Movies and Anime artwork services. Do not put it in client-side variables or commit it.

TMDB artwork is hotlinked from the TMDB image CDN and is not re-hosted. Include the official TMDB logo and the notice “This product uses the TMDB API but is not endorsed or certified by TMDB.” in the app footer/About area. Review the current TMDB terms and licence for the intended use.

## Episode discovery and playback are not changed by this catalogue work

`EPISODE_PROVIDERS`, HiAnime settings, playback host allowlists and the playback resolver remain separate from `LIVE_PROVIDERS`. Changing the catalogue to MAL does not make MAL an episode or playback provider. The currently configured episode providers need their own availability and terms review; do not infer watch-page playback availability from a successful MAL detail response.

ZokoAnime iframe playback remains opt-in and disabled unless `ZOKOANIME_EMBED_ENABLED=true`. Review its terms and event contract separately before enabling it.
