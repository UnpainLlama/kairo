# MASTER BUILD PROMPT — KAIRO ANIME DISCOVERY PLATFORM

You are acting as a principal product designer, senior UX researcher, staff frontend engineer, Cloudflare platform architect, backend engineer, database designer, application-security engineer, and test engineer.

You have been given a project folder containing a starter application and its specification. Read the complete folder before editing anything. The key documents are:

- `docs/PRODUCT_SPEC.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/ARCHITECTURE.md`
- `docs/API_CONTRACT.md`
- `docs/CLOUDFLARE_SETUP.md`
- `docs/GITHUB_SETUP.md`
- `docs/SECURITY_AND_CONTENT.md`
- `docs/IMPLEMENTATION_ROADMAP.md`

The root folder also contains a React/Vite application, Cloudflare Worker, Wrangler configuration, D1 migration, and GitHub Actions workflow. Preserve and improve these assets. Do not throw away the supplied architecture or replace it with a generic dashboard template.

## Mission

Build **KAIRO**, a premium anime discovery and licensed-playback experience. It should have the cinematic browsing comfort of a major subscription streaming service while establishing a distinct identity through its own palette, typography, layout language, motion, and character-art treatment. It must be a real full-stack application, not just a static mockup.

The application must be capable of connecting to authorized anime metadata providers and playback providers. Do not implement scraping, bypassing access controls, circumvention of bot challenges, unauthorized stream extraction, or decryption of protected third-party payloads. When a provider or source is unavailable or not configured, show a good user-facing state and document the exact missing integration requirement. Do not invent successful provider responses.

## Non-negotiable design direction

Use the **Astral Plum** palette as the initial theme:

- App background: `#090B16`
- Main surface: `#111628`
- Raised surface: `#192139`
- Primary electric iris: `#9278FF`
- Secondary jade: `#62D8C8`
- Warm coral: `#FF9C78`
- Soft gold: `#F1C879`
- Main text: `#F4F1FF`
- Muted text: `#A6AEC5`

Also implement the other three switchable themes in `docs/DESIGN_SYSTEM.md`: Sakura Ember, Ocean Circuit, and Moonlit Jade. Avoid Netflix's red/black identity. The visual should feel anime-native but sophisticated, collectible, cinematic, and readable.

Use character decorations as art direction, not as clutter. Create intentional art slots for transparent cutout character illustrations supplied by the project owner or a licensed source. Place character artwork on the outer right side of hero sections, behind or beside text, never over important controls or faces. Use soft radial atmospheres, low-opacity motifs, layered gradients, subtle grain, and restrained parallax. Do not create or fetch unlicensed character artwork. When no artwork is present, use an elegant CSS illustration placeholder.

## Product experience to complete

Implement all requirements in `docs/PRODUCT_SPEC.md`, including:

1. Home / discover page with cinematic feature stage, continue watching, trending, latest updates, seasonal picks, genre rails, and recommendations.
2. Search with suggestions, filters, sort, pagination, keyboard support, loading, empty, and error states.
3. Anime details with synopsis, metadata, genres, status, related titles, episode list, and library actions.
4. Watch page with accessible player controls and authorized HLS playback support, subtitle tracks, quality selection when supplied by the provider, resume position, next/previous episode, and unavailable-source UI.
5. Personal library with watchlist, favorites, watching, completed, paused/on-hold, dropped, and history.
6. User profile and preferences.
7. Settings for themes, language, subtitles, playback, privacy, and account.
8. Responsive navigation and a polished mobile experience.

## UX quality bar

- Every visible control must work or be clearly disabled with an explanation.
- Use skeleton loaders, toast feedback, empty states, retry flows, confirmation dialogs, and optimistic updates only where rollback is implemented.
- Use URL state for search/filter/page state where practical.
- Make keyboard navigation and visible focus states first-class.
- Respect `prefers-reduced-motion`.
- Use semantic HTML, accessible labels, sufficient color contrast, and responsive hit areas.
- Lazy-load posters and use aspect-ratio placeholders to avoid layout shift.
- Do not block the page while a single carousel or metadata request is loading.

## Required technical architecture

Use the included stack unless the existing repository gives a concrete technical reason to change it:

- React + TypeScript + Vite.
- Cloudflare Vite plugin for Workers development and deployment.
- Cloudflare Worker as the backend API.
- Hono or the existing router pattern for route organization.
- Cloudflare D1 for durable relational user and catalogue data.
- Cloudflare KV only for short-lived, non-sensitive cache entries where appropriate.
- Optional R2 for assets the project owns or is licensed to store.
- An established identity provider using OIDC/OAuth or a well-maintained auth library compatible with Workers. Never store plaintext passwords or invent a custom password hashing system.
- HLS.js only for authorized HLS manifests.

Keep frontend, Worker, database, and provider integrations separated. Use the provider adapter contracts in `docs/ARCHITECTURE.md`. Do not hardcode provider-specific assumptions into UI components.

## Backend requirements

Complete the REST API described in `docs/API_CONTRACT.md`. At minimum implement:

- Health and readiness checks.
- Featured catalogue, trending, latest, seasonal, search, genre discovery, details, related titles, and episode listing.
- User profile read/update after authentication is configured.
- Library list/add/update/remove.
- Watch progress read/write with debouncing and server validation.
- Watch history read/clear with explicit confirmation.
- User preferences read/update.
- Playback-source resolution only through configured authorized provider adapters.

Use one consistent JSON envelope. Validate every path, query, and JSON body. Enforce pagination bounds. Use parameterized D1 queries. Return stable machine-readable error codes. Add request IDs and structured logs without logging tokens, cookies, playback credentials, or personal data.

## Cloudflare and GitHub requirements

Preserve the `wrangler.jsonc` and GitHub workflow. Finish the setup documentation so a developer can:

1. Create a Cloudflare account and authenticate Wrangler.
2. Create D1 and apply local/remote migrations.
3. Configure KV and R2 only when the implemented feature actually requires them.
4. Configure non-secret variables and secrets using the correct Cloudflare bindings/secrets mechanisms.
5. Push the repository to GitHub.
6. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets.
7. Run tests/build in CI and deploy only from the protected production branch.
8. Add a custom domain and verify health, API, assets, and HTTPS.

Never put tokens, passwords, private provider credentials, or real database secrets into committed files. Keep `.dev.vars*`, `.env*`, and local Wrangler state out of Git.

## Database requirements

Review and extend the existing D1 migration. Use foreign keys, unique constraints, appropriate indexes, timestamps, and ownership boundaries. Keep content provider references separate from user data. Make migration changes additive and versioned; do not rewrite old migrations after they have been applied.

## Testing requirements

Add meaningful tests for:

- Search query validation and pagination.
- API response shape and stable errors.
- D1 catalogue queries.
- Authentication and ownership checks.
- Library CRUD.
- Progress validation and update rules.
- Provider unavailable / invalid response handling.
- Responsive UI states and key user flows.

Run type checking, linting, tests, and production build. Fix errors rather than merely reporting them. If a test cannot run because an external provider or secret is absent, clearly mark it as blocked and keep a deterministic mock test for the adapter contract.

## Execution approach

Work in phases, but continue through implementation rather than stopping at an architecture essay:

1. Inventory files and summarize existing structure.
2. Identify gaps between the starter and specification.
3. Confirm package versions and Cloudflare config compatibility.
4. Implement the complete design system and page flows.
5. Implement backend routes and D1 operations.
6. Implement auth integration behind a documented provider configuration.
7. Implement catalogue and playback provider adapters with safe, explicit contracts.
8. Add tests and accessibility checks.
9. Run all checks and production build.
10. Update README and deployment runbooks with exact commands.

Do not delete files without a reason. Do not replace the visual design with a stock template. Do not claim a feature is complete if it is only a placeholder. For any missing external credential or provider agreement, build the correct integration boundary and clearly state what must be configured by the owner.

## Definition of done

The result is considered complete only when:

- All primary routes render and are responsive.
- Search, details, navigation, theme switching, and demo browsing work end-to-end.
- Backend catalogue endpoints use D1 and return documented JSON.
- The schema supports users, preferences, libraries, episodes, and playback progress.
- Auth-protected routes reject anonymous requests and enforce ownership once an identity provider is configured.
- Playback accepts only explicitly authorized provider responses.
- GitHub Actions validates the project and can deploy with configured secrets.
- Cloudflare local/remote migration and deployment instructions are accurate.
- Type check, lint, tests, and production build pass.
- Every incomplete external dependency is documented honestly.

Start by reading the project files. Then implement the application. Do not ask me to repeat requirements that are already in this folder.
