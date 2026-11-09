# Security, privacy, and authorized content

## 1. Identity and sessions

Use an established identity provider or a well-maintained authentication library designed for Cloudflare Workers. Validate issuer, audience, signature, expiry, and nonce/state where relevant. Prefer secure, HttpOnly, SameSite cookies for browser sessions where supported. Protect state-changing requests against CSRF according to the chosen auth architecture.

Do not store plaintext passwords. Do not invent a password hashing scheme. Never accept a client-supplied account ID as proof of identity.

## 2. Authorization

- Enforce ownership checks for every library, progress, history, preference, and profile mutation.
- Deny by default.
- Validate role/permission claims from trusted identity data.
- Keep administrative operations separate from user operations.

## 3. Input and output safety

- Validate IDs, query strings, JSON bodies, enum values, and pagination.
- Use parameterized SQL for every database query.
- Restrict outbound provider calls to configured provider hosts.
- Do not accept arbitrary URLs from users and fetch them on the server.
- Set appropriate content-type, frame, referrer, and nosniff headers.
- Sanitize any rich text before rendering it as HTML.

## 4. Secrets

- Use Cloudflare Worker secrets for production credentials.
- Use `.dev.vars` for local-only values and keep it out of Git.
- Keep a `.env.example` containing names only, never live values.
- Keep GitHub deployment credentials in Actions secrets.
- Rotate exposed credentials immediately.

## 5. Data minimization

Collect only what the product needs. Avoid logging search histories, account identifiers, session tokens, private playback URLs, or profile details. Establish retention rules for viewing history and account deletion. Provide user-visible controls for clearing history and deleting an account where applicable.

## 6. Authorized metadata and playback

- Integrate providers only when the project owner has permission and the provider terms permit the intended use.
- Respect provider rate limits, caching restrictions, attribution requirements, and geographical/entitlement rules.
- Do not bypass authentication, bot challenges, paywalls, DRM, or other access controls.
- Do not extract or decrypt protected third-party playback payloads.
- Return playback URLs only when the provider explicitly authorizes the application/user to play them.
- Do not proxy external media unless the provider contract permits it.
- Make unavailable-source states clear and non-deceptive.

## 7. Reliability

Use request timeouts, bounded retries for idempotent requests, structured errors, and circuit-breaker/backoff behavior for providers that repeatedly fail. A provider failure must not take down unrelated catalogue and account pages.
