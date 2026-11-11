# Kairo account architecture — Phase 1

## Product decisions

- Registration is open.
- Kairo supports email/password and Google sign-in as two authentication methods for one Kairo account.
- Browsing the public catalogue remains available without an account.
- Personal features are scoped to the authenticated Kairo user.
- Google sign-in (OpenID Connect identity) and Google/YouTube provider authorization are separate consent flows and separate records.
- Never merge accounts automatically based only on matching email addresses. Linking another sign-in method requires an authenticated, explicit linking flow.

## Existing data model

The existing `user_profiles` row is the Kairo user record: `user_preferences`, `user_library`, `watch_progress` and `viewing_history` already reference it. Phase 1 extends that record rather than creating a parallel `users` table, preserving existing foreign keys and user data.

For new users, `identity_subject` remains a required internal compatibility field. External identity subjects are stored in `auth_identities`.

## Phase 1 schema

Migration `0003_accounts.sql` adds:

- Account email, verification timestamp, status and role to `user_profiles`.
- `auth_identities` for email and Google OIDC subjects.
- `password_credentials` for password hashes, separate from profile data.
- `sessions` for hashed opaque session tokens and expiry.
- Single-use hashed `email_verification_tokens` and `password_reset_tokens`.
- Per-user `provider_connections`; provider tokens are encrypted before persistence.

Session cookies are HTTP-only, Secure in deployed environments, SameSite=Lax and path-wide. The browser receives the opaque token; D1 stores only its SHA-256 hash. Session identity is derived server-side and must never be selected using a client-supplied user ID.

## Security requirements for the next phase

- Select and verify a Workers-compatible Argon2id password-hashing implementation before enabling password registration. Do not substitute fast SHA-256 password hashes.
- Add rate limiting to registration, login, verification and password-reset endpoints.
- Enforce CSRF/origin protections on state-changing cookie-authenticated routes.
- Verify Google ID tokens (issuer, audience, signature, expiry and nonce) server-side.
- Do not silently link an existing email account to a Google identity.
- Encrypt provider access/refresh tokens with authenticated encryption and a Worker secret before writing them to D1.
- Never log passwords, session tokens, verification/reset tokens, OAuth codes, or provider tokens.
- Derive the user ID from the authenticated session for every personal-data query.
- Do not grant admin to the first registered account.

## Deliberately not enabled in Phase 1

No registration/login endpoints, Google callback, email delivery, password hashing algorithm, OAuth token exchange, UI, or D1 deployment is enabled by this foundation migration. Those require their own implementation and configuration steps. Existing `/api/v1/me` remains unauthenticated until the complete login/session-creation flow is implemented.
