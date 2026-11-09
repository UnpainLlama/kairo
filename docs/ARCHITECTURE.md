# Technical architecture

## 1. Deployment model

Use one Cloudflare Worker deployment to serve the React SPA assets and `/api/*` application routes. The Cloudflare Vite plugin runs the Worker in a Workers-like environment during local development and creates the deployment output. D1 provides relational persistence. KV is optional for short-lived public metadata caching. R2 is optional for artwork the project owns or is licensed to store.

## 2. High-level flow

```text
Browser (React + Vite)
  |-- / assets ----------------------> Cloudflare Workers Static Assets
  |
  |-- /api/v1/* ---------------------> Cloudflare Worker API (Hono)
                                          |-- D1: catalogue + user data
                                          |-- KV: optional public cache
                                          |-- Identity provider: OIDC/OAuth
                                          |-- Metadata provider adapters
                                          |-- Authorized playback adapters
                                          `-- R2: optional authorized artwork
```

## 3. Frontend boundaries

- `src/pages/` owns route-level compositions.
- `src/components/` owns reusable UI.
- `src/features/` groups search, catalogue, library, profile, and player logic.
- `src/lib/api.ts` is the only general HTTP client entry point.
- `src/theme/` owns theme tokens and persistence.
- `src/types/` owns shared frontend contracts.

Do not call provider APIs directly from UI components. The frontend talks only to the application API.

## 4. Worker boundaries

- Route handlers validate request input and call service functions.
- Services own business logic.
- Repositories own D1 queries.
- Provider adapters normalize third-party authorized data into internal types.
- Authentication middleware validates identity-provider tokens/sessions.
- Authorization checks resource ownership at every user-data boundary.
- Error middleware returns stable JSON envelopes and request IDs.

## 5. Provider adapter contracts

Metadata provider interface (illustrative):

```ts
export interface AnimeMetadataProvider {
  readonly id: string;
  search(input: { query: string; page: number; limit: number }): Promise<CatalogPage>;
  getTitle(providerTitleId: string): Promise<AnimeRecord | null>;
  getEpisodes(providerTitleId: string): Promise<EpisodeRecord[]>;
}
```

Playback provider interface (illustrative):

```ts
export interface AuthorizedPlaybackProvider {
  readonly id: string;
  resolve(input: { providerEpisodeId: string; requestedAudio?: string }): Promise<AuthorizedPlaybackResult>;
}
```

`AuthorizedPlaybackResult` identifies the provider and may describe either an HLS manifest (with subtitle tracks and variants supplied by the provider) or an approved iframe embed URL. Both forms may include an expiry. Never place provider secrets in the browser. Do not treat arbitrary user-supplied URLs as playable sources. The backend must allowlist provider hosts, require HTTPS, reject credentials and non-standard ports, and validate expiry before returning a source. Iframe sources are not equivalent to direct media extraction; the client must render them in a restricted player frame.

## 6. Data ownership

- Canonical anime and episode records may be shared catalogue data.
- User profile, preference, library, and progress rows must be scoped to the authenticated subject ID.
- Never infer identity from a client-supplied `userId` field.
- Keep provider identifiers namespaced by provider ID to avoid collisions.
- Keep cache entries public and non-sensitive. Never cache personalized responses under a shared cache key.

## 7. Caching

- Cache public catalogue metadata only when the provider terms permit it.
- Use short TTLs for rapidly changing episode updates and longer TTLs for stable metadata.
- Use a versioned cache key and provider ID.
- Cache misses must not break the request.
- Do not put access tokens, cookies, user progress, or private account data in KV.

## 8. Playback and media

The app may use HLS.js for browser playback of authorized HLS manifests. Keep player logic behind a `PlaybackAdapter` so providers can change independently. Only accept source URLs returned by a configured, approved provider. Use secure HTTPS, provider entitlement checks, source expiry handling, and appropriate CORS configuration. Do not proxy third-party media unless the provider contract explicitly permits it.

## 9. Optional Cloudflare products

- **KV:** public metadata cache.
- **R2:** original/authorized posters, banners, avatars, and artwork. Use signed upload/download flows if private objects are needed.
- **Turnstile:** only for appropriate public forms where bot protection is useful; don't build a mechanism to circumvent other providers' challenges.
- **Queues:** optional background catalogue sync when permitted by provider terms.
- **Analytics Engine:** optional aggregate usage metrics, avoiding personal or sensitive payloads.

Add these bindings only when the feature is implemented and configured. Do not leave dummy IDs in production bindings.
