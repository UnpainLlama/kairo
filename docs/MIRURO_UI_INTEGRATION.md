# Miruro-inspired Anime workspace

The authenticated username/password application now carries the Anime-only Miruro-inspired presentation into `KairoApp`. The styling and navigation are scoped to Anime routes; Movies, account-management pages and the existing shared account context retain their own presentation and routes.

## Boundaries

- The Anime workspace uses the existing Kairo `/catalog/*` and `/anime/:id` APIs. MAL is the sole live Anime metadata provider and TMDB supplies artwork only; the frontend does not call Miruro or external catalogue APIs directly.
- Featured, trending/popularity, latest-season, airing and discovery collections are sourced from existing catalogue endpoints. MAL does not provide a global latest-episodes feed.
- The featured banner has manual controls, keyboard navigation, swipe support, reduced-motion handling and pauses automatic rotation while the tab is hidden.
- Ranking tabs are a local view state over separate Kairo catalogue queries; they do not store a second catalogue or account.
- The home page's Continue watching rail reads the shared `/me/playback` endpoint, so Anime and Movies progress continue to use the same account data.
- The Anime-only header and monochrome layout are enabled only on Anime routes. Movie watch/browse and account settings/profile pages keep the existing shell styles.
- Anime, Movies and administrator-only YouTube remain within the Kairo account boundary. This visual workspace does not create separate identities, profiles, libraries, favorites or session scopes.

## Player boundary

The homepage Watch now action continues into the existing Kairo Anime watch route. Player/provider changes remain separate from this UI port; playback resolution, host allowlists and account progress services are unchanged.

## Styling and dependencies

The Anime workspace uses scoped styles in `src/styles.css` and existing React Router, Lucide and catalogue components. It reuses Kairo's shared account and playback data; no duplicate Anime account/library or D1 migration is introduced.
