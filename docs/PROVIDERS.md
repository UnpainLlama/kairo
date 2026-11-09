# Metadata providers

KAIRO combines several metadata sources into one unified record. No provider is a permanent dependency: each one is an adapter that can be switched off, replaced or added without touching the frontend or the routes.

**Three separate services.** Metadata (this document), episode discovery (`EpisodeProvider`, contract only) and playback (`worker/providers/playback.ts`) are independent. A metadata provider is never assumed to supply episodes or streams.

## 1. Provider roles

The catalogue provider supplies title identity and episode discovery metadata. **TMDB is a separate artwork enrichment provider**: it searches the TV or movie catalogue by title/year and returns portrait poster and landscape backdrop URLs. It does not replace HiAnime, Jikan or AniList catalogue IDs, and it does not supply episode or playback data.

## 2. What was verified (2026-11-06)

| Source | Role | Auth | Rate limit | Terms | Status |
|---|---|---|---|---|---|
| **AniList** (GraphQL, `graphql.anilist.co`) | Live detail: synopsis, genres, banner, score | None for public reads | 90 requests/min. A burst limiter also exists, and 429 carries `Retry-After`. One docs page warns of a temporary 30/min degraded mode. | Read in full at docs.anilist.co/guide/terms-of-use | **Verified.** Free for non-commercial use; no use as backup or data storage; no hoarding or mass collection; naming guidelines; no competing list/tracker services. |
| **Kitsu** (JSON:API, `kitsu.io/api/edge`) | Live detail (secondary) | Third-party client docs say public reads need no key | Not published in anything I could read | `kitsu.io/terms` **could not be fetched**; not read | **Unverified.** Adapter is built but `termsVerified = false` and it is OFF by default. |
| **anime-offline-database** (manami-project) | Catalogue index and cross-provider ID map (dataset, not an API) | None (a file download) | n/a | Recent releases: ODbL-1.0 (attribution and share-alike). Older releases: AGPL-3.0. The file carries its own `license` field. | **Partly verified** from repository pages. The importer refuses any licence that is not ODbL-1.0. Re-check the release you import. |
| **TMDB** (v3 REST API) | Independent artwork only: posters and landscape backdrops | API Read Access Token (Bearer secret) | Rate limiting applies; KAIRO uses bounded concurrency, caching and fail-open behavior | Developer API is free for non-commercial use with attribution; commercial use requires a separate licence | **Enabled only when `TMDB_ACCESS_TOKEN` is configured.** It does not supply catalogue identity, episodes or playback. |

Not verified, and so not used: Kitsu's own terms and rate limits; Kitsu/AniList field names against live responses (see section 7). TMDB API authentication, search and image-path documentation were checked, but KAIRO's live API key and title-match quality still need to be validated after deployment.

## 3. Architecture

```
route /api/v1/anime/:id/metadata
  -> stored catalogue row (always the floor)        worker/repositories/providerIds.ts
  -> for each ENABLED provider (in parallel):       worker/metadata/enrich.ts
       circuit breaker -> cache -> by known ID, else title search + duplicate matching
       timeout, 429/5xx/invalid-response mapped to outcomes, never to a failed page
  -> merge with field priorities + provenance       worker/metadata/merge.ts
  -> response: unified record, sources, per-provider outcomes, meta.degraded
```

| Need | Where |
|---|---|
| Provider adapters | `worker/metadata/providers/{anilist,kitsu,manami}.ts` |
| Normalisation to KAIRO vocabulary | `normalize.ts` (formats, statuses, seasons, 0-10 rating, plain-text synopsis, https-only URLs) |
| Duplicate detection | `match.ts` |
| Cross-provider ID mapping | table `anime_provider_ids`; new IDs found by a confident title match are saved (first writer wins) |
| Conflict resolution | `merge.ts` |
| Source attribution | `data_sources` table, `Attribution` per adapter, shown on each title page |
| Fallback | each provider fails independently; the stored row is always returned |
| Caching | `cache.ts` (KV, edge Cache API or memory) |
| Error handling | `ProviderError` kinds `not_found`, `rate_limited`, `unavailable`, `invalid_response` |

### Duplicate detection rules
1. A shared external ID is a certain match (score 1). A different ID from the same provider is a certain non-match (0).
2. Otherwise an exact normalised title overlap scores 0.7, then: same year +0.15 (one year apart -0.2, more than one year apart = 0); same format +0.1 (different -0.3); same episode count +0.05 (different -0.1).
3. 0.85 or more is accepted. 0.6 to 0.85 is "ambiguous" and is NOT merged. A tie between candidates is refused.
4. There is no fuzzy matching on purpose: a wrong merge puts one show's data on another, which is worse than a missed merge.

### Artwork matching
- TMDB matching is separate from metadata merge and never changes title identity or provider IDs. It searches TV shows for series/OVA/ONA/special titles and movies for films.
- Candidate titles are compared against the catalogue title and alternate titles, with the release year used as a confidence signal. Low-confidence matches are ignored.
- Search-result poster/backdrop paths are preferred. If either image is absent, the adapter requests the matching TV/movie images endpoint and selects an appropriate alternate poster or landscape backdrop. Paths are converted to HTTPS `image.tmdb.org` URLs (`w500` poster and `w1280` backdrop).
- Positive matches are cached for 30 days; no-match results for 7 days. TMDB failures do not fail catalogue requests.

### Conflict resolution
Static priority per field, highest first: **anilist, kitsu, manami**, with unlisted providers last (alphabetical). Edit `DEFAULT_PRIORITY` in `merge.ts` to change it.

- A missing value never wins; the next provider in priority is used. Nothing is invented.
- Status is `airing`, `finished`, `upcoming` or `hiatus`. Live providers beat the stored dataset snapshot, which can be weeks old.
- Genres, alternative titles and IDs are unions.
- Rating is never averaged across providers. It is taken from the highest-priority provider and is always on a 0-10 scale.
- When providers disagree on format, status, season, year, episode count or rating, the response lists a `conflicts` entry with the chosen value and the alternatives. Wording and image fields (title, synopsis, posters) differ by nature and are not logged as conflicts.
- Every value has `provenance`: which provider supplied it and when it was fetched.

### Caching and terms
- AniList forbids using its API as storage, so provider responses are **never written to D1**. They live in a cache with an expiry: 6 hours for hits, 1 hour for "not found", 1 minute after errors.
- Only IDs are persisted (`anime_provider_ids`), not provider content.
- **Cloudflare's docs say the Cache API has no effect on `*.workers.dev` and does not replicate between data centres.** For a workers.dev deploy, use the KV cache (section 4).
- The circuit breaker is held in one Worker isolate's memory, so it is a best-effort guard. A 429 opens it for the `Retry-After` period (default 60 s).

## 4. Attribution
- Each title page lists the sources that contributed to it, with the provider's attribution text and link. The footer states that.
- AniList: the terms do not require an on-page credit; it is shown as a courtesy and says KAIRO is unofficial. Never name anything "AniList" alone.
- anime-offline-database: ODbL requires attribution, shown. Share-alike applies to a *publicly shared* derived database. KAIRO is a private personal site and does not distribute the database. If that ever changes, review this first.
- TMDB artwork: hotlinked from TMDB image CDN, never re-hosted. Include the official TMDB logo and the notice “This product uses the TMDB API but is not endorsed or certified by TMDB.” in the app footer/About area. The developer API is for non-commercial use with attribution; contact TMDB for commercial licensing.
- Other artwork: hotlinked from its source provider, never re-hosted. Rights stay with their owners.

## 5. Configuration steps (owner)

**Which providers are on.** `wrangler.jsonc` > `vars` > `METADATA_PROVIDERS` is a comma-separated list. It ships as `"anilist"`. Empty means no live providers (the site still works from the stored catalogue). To enable Kitsu later, first read https://kitsu.io/terms and confirm its limits, then set `"anilist,kitsu"`.

**Cache.** The KV namespace and its `METADATA_CACHE` binding are declared per environment in `wrangler.jsonc`; creating it is step 2b of docs/DEPLOYMENT.md. Without it the Worker still runs, using the Cache API (no effect on workers.dev) or per-isolate memory.

AniList and Kitsu public reads need no API key. TMDB requires an API Read Access Token stored as the Worker secret `TMDB_ACCESS_TOKEN`. Set it with `npx wrangler secret put TMDB_ACCESS_TOKEN --env staging`; do not add it to `wrangler.jsonc` or commit it. For local development, put `TMDB_ACCESS_TOKEN="..."` in gitignored `.dev.vars`. Without the token, catalogue artwork remains the fallback.

## 6. Adding a provider later
1. Write `worker/metadata/providers/<name>.ts` that returns a `MetadataProvider` (a `fetchById` and a `search` returning `NormalizedMetadata`, plus its `Attribution` and `termsVerified`).
2. Add one line to `FACTORIES` (and `ATTRIBUTIONS`) in `worker/metadata/service.ts`.
3. Add it to `DEFAULT_PRIORITY` in `merge.ts` if it should outrank the unlisted default.
4. Add it to `METADATA_PROVIDERS`. The frontend needs no change: sources and statuses come from the API.

## 7. First live check (not done yet)
The adapters were tested only against **hand-written fixtures** that follow each provider's documented shape (`worker/metadata/providers.test.ts` says so). No real provider response has been captured. After the first deploy:
1. Open `/api/v1/providers`, then `/api/v1/anime/<slug>/metadata` for a title that exists in the catalogue.
2. Check `providers[]`: `ok` is good; `failed` with `invalid_response` means the real shape differs from the fixture. Send me that output and I will fix the adapter.
3. Adapters fail closed: an unexpected shape becomes an `invalid_response` outcome, never wrong data.

## 8. Not built yet
- The dataset import job (download a release, check its licence, map, load chunked SQL into D1). The mapper and the licence check exist in `providers/manami.ts`; D1's current bulk-load limits still need checking.
- Dataset "tags" are not mapped to genres (they are not the same thing), so imported titles have no genres until a provider fills them in on demand.
- Kitsu episode discovery (a separate `EpisodeProvider`, only after Kitsu's terms are verified).
- Authentication. Decision: a standard identity provider for public users, with Cloudflare Access reserved for admin tools. Not chosen or built; it stays behind its own module so it can be swapped.
