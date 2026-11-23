# Kairo client reset

This branch removes the existing client-side user experience so it can be rebuilt cleanly.

## Removed from the client

- Existing page and navigation UI, including account/profile, library, favorites, history, settings and administrator screens.
- Existing Cloudflare Access email sign-in and one-time administrator setup UI.
- Frontend account context, account-scoped hooks and local account/library UI state.
- User-facing catalogue cards and page presentation that will be recreated during the client rebuild.

The React entry point now renders a temporary reset shell.

## Preserved

- All files under `worker/`: authentication/session handling, admin/auth API routes, metadata/catalogue providers, episode and streaming routes, movies and YouTube provider services.
- All files under `migrations/`: historical schema and migration sequence are left untouched.
- Existing API route paths and Worker request/response contracts.
- Generic API clients and catalogue/movie types in `src/lib/`.
- Reusable Anime, HLS, Movie and YouTube playback engine components and their supporting playback modules.
- Wrangler, deployment workflows, runtime configuration, public assets and backend test coverage.

## Important scope boundary

This reset does **not** change the server-side authentication model or convert it to username/password. The Worker authentication endpoints have been intentionally retained unchanged so the next authentication rebuild can migrate their behavior without silently dropping API routes or session enforcement.

The current Worker still uses its existing Cloudflare Access identity flow and retains the current bootstrap endpoint. The old client bootstrap/login UI has been removed. Replace the server-side flow deliberately as part of the new username/password authentication implementation before exposing a rebuilt login screen.

Do not use a fixed public `admin/admin` credential. The new implementation should provision the `admin` username with a one-time environment-supplied initial secret or a forced password-change flow, then store only a salted password hash. No default password should be committed to source control.

## Data and deployment safety

- No D1 data, schema, or migration file was deleted or modified.
- No Cloudflare Worker, Access policy, GitHub secret or environment variable was changed.
- No deployment was triggered by this branch change.
