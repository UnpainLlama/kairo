# Miruro-inspired Anime workspace

The `miruro-ui` branch introduces an Anime-only presentation layer inspired by the supplied Miruro UI reference. The intent is to give Anime its own browsing experience without splitting the Kairo platform into separate products.

## Boundaries

- The Anime workspace remains inside the existing Kairo application and route tree.
- The Anime catalogue continues to use Kairo's `/catalog/*` and `/anime/:id` API contracts. The Worker keeps AniList as its first-choice live catalogue provider; MAL/HiAnime compatibility behavior is unchanged.
- Search, trending, popularity, rating, seasonal discovery, episode metadata and title details are still Kairo data flows. No Miruro Apollo client, Miruro AniList GraphQL client, or Miruro catalogue cache is introduced.
- Authentication remains the single shared Kairo account context. Anime, Movies and administrator-only YouTube do not get separate identities, account databases, profiles, or session scopes.
- Watch history, library, favorites, settings and account-level media progress continue to use the existing Kairo storage and sync services. A visual workspace boundary is not a data boundary.
- The playback/player implementation and provider resolution are intentionally unchanged in this UI phase. Provider research and player changes are a later workstream.

## UI scope

The Anime-only `kc-anime-mode` class scopes its top navigation, black cinema canvas, wide featured hero, ranking tabs and dense poster layout. Movies and administrator-only YouTube retain their existing styling and routes.

No additional runtime dependencies or database migrations are required for this presentation change.
