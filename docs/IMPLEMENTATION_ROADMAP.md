# Implementation roadmap and acceptance checklist

## Phase 0 — Foundation

- [ ] Install dependencies and generate package lock.
- [ ] Replace Worker name and D1 ID.
- [ ] Create Cloudflare D1 and apply initial migration.
- [ ] Run local app and verify `/api/health`.
- [ ] Push repo to GitHub and configure Actions secrets.

## Phase 1 — Design system

- [ ] Extract design tokens into CSS variables.
- [ ] Implement four theme palettes and persistent selection.
- [ ] Complete nav rail, mobile nav, cards, chips, buttons, dialogs, toasts, skeletons, and typography.
- [ ] Add licensed/original hero character artwork and source manifest.
- [ ] Check contrast and reduced-motion behavior.

## Phase 2 — Catalogue

- [ ] Define canonical anime/episode TypeScript models.
- [ ] Implement provider adapter interface.
- [ ] Configure one authorized metadata source.
- [ ] Add catalogue ingestion/sync process if permitted.
- [ ] Implement trending/latest/search/genres/details/episodes/related.
- [ ] Add cache only where provider terms allow it.

## Phase 3 — User identity and library

- [ ] Select and configure an identity provider.
- [ ] Implement session validation in Worker.
- [ ] Add profile and preferences routes.
- [ ] Implement library CRUD with ownership checks.
- [ ] Implement favorites and viewing history.
- [ ] Add export/delete flows as required by privacy policy.

## Phase 4 — Player and progress

- [ ] Connect an authorized playback provider.
- [ ] Validate provider response and URL host.
- [ ] Implement HLS.js player for authorized HLS.
- [ ] Implement subtitle selection and variant menu when available.
- [ ] Save/resume progress with debounce and retry boundaries.
- [ ] Add unavailable-source, expired-source, and retry UI.

## Phase 5 — Quality

- [ ] Add unit and integration tests.
- [ ] Add accessibility checks and keyboard test pass.
- [ ] Test mobile widths and touch controls.
- [ ] Test provider timeout and invalid response handling.
- [ ] Verify no secrets are committed.
- [ ] Run typecheck, lint, tests, and production build.

## Phase 6 — Release

- [ ] Apply reviewed remote D1 migrations.
- [ ] Configure production secrets.
- [ ] Confirm GitHub Actions deployment.
- [ ] Add custom domain and verify TLS.
- [ ] Verify health, catalogue, player, and account routes.
- [ ] Configure error monitoring and privacy-conscious analytics.
- [ ] Publish content-provider attribution and privacy/terms pages.

## Release acceptance criteria

A release candidate is acceptable only when all critical routes have real loading/error/empty states, no primary control is inert, protected data is authenticated and ownership-checked, no demo content is mistaken for live provider content, API errors are stable, and the Cloudflare deployment can be reproduced from a clean checkout using the documentation.
