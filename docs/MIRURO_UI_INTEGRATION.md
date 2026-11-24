# Miruro-inspired Anime workspace

The authenticated username/password application now carries the Anime-only Miruro-inspired presentation into `KairoApp`. The styling and navigation are scoped to Anime routes; Movies, account-management pages and the existing shared account context retain their own presentation and routes.

## Boundaries

- The Anime workspace uses the existing Kairo `/catalog/*` and `/anime/:id` APIs. AniList remains the primary live catalogue provider; the frontend does not call Miruro or AniList GraphQL directly.
- Featured titles, trending, popularity, rating, latest, airing and upcoming collections are sourced from existing catalogue endpoints.
- The featured banner has manual controls, keyboard navigation, swipe support, reduced-motion handling and pauses automatic rotation while the tab is hidden.
- Ranking tabs are a local view state over separate Kairo catalogue queries; they do not store a second catalogue or account.
- The home page's Continue watching rail reads the shared `/me/playback` endpoint, so Anime and Movies progress continue to use the same account data.
- The Anime-only header and monochrome layout are enabled only on Anime routes. Movie watch/browse and account settings/profile pages keep the existing shell styles.
- Anime, Movies and administrator-only YouTube remain within the Kairo account boundary. This visual workspace does not create separate identities, profiles, libraries, favorites or session scopes.

## Player boundary

The homepage Watch now action continues into the existing Kairo Anime watch route. Player/provider changes remain separate from this UI port; playback resolution, host allowlists and account progress services are unchanged.

## Styling and dependencies

The Anime workspace uses scoped styles in `src/styles.css` and existing React Router, Lucide and catalogue components. No runtime dependency, API provider, catalogue cache or database migration is added for this visual integration.
