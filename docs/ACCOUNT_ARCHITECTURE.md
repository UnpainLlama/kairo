# Kairo account architecture — Phase 1

## Product decisions
- Registration is open.
- Kairo supports email/password and Google sign-in as two authentication methods for one Kairo account.
- Browsing the public catalogue remains available without an account.
- Personal features are scoped to the authenticated Kairo user.
- Google sign-in (OpenID Connect identity) and Google/YouTube provider authorization are separate consent flows and records.
- Never merge accounts automatically based only on matching email addresses. Linking another sign-in method requires an authenticated, explicit linking flow.

## Existing data model
The existing `user_profiles` row is the Kairo user record: `user_preferences`, `user_library`, `watch_progress` and `viewing_history` already reference it. Phase 1 extends that record rather than creating a parallel `users` table, preserving existing foreign keys and user data.

For new users, `identity_subject` remains a required internal compatibility field. External identity subjects are stored in `auth_identities`.

## Phase 1 schema
Migration `0003_accounts.sql` adds:
- Account email, verification timestamp, status and role to `user_profiles`.
- `auth_identities` for email and Google OIDC subjects.
- `password_credentials` for versioned password hashes, separate from profile data.
- `sessions` for hashed opaque session tokens and expiry.
- Single-use hashed `email_verification_tokens` and `password_reset_tokens`.
- Per-user `provider_connections`; provider tokens are encrypted before persistence.

## Password hashing
Kairo uses **PBKDF2-HMAC-SHA-256, 600,000 iterations, a 16-byte cryptographically random salt, and a 256-bit derived hash**. This uses Workers-native Web Crypto and avoids a native/WASM dependency. OWASP specifies 600,000 iterations for PBKDF2-HMAC-SHA-256.

The encoded format is `pbkdf2-sha256$v=1$i=600000$<salt-base64url>$<hash-base64url>`. The algorithm, version and cost are explicit. Verification rejects unknown versions and costs rather than trusting iteration counts read from D1. Password input is encoded as UTF-8 without trimming or normalization and capped at 1,024 bytes. Registration policy should require at least 12 characters and permit long passphrases up to this cap.

Argon2id remains OWASP's preferred general-purpose choice. PBKDF2 is selected because Workers provides it natively through Web Crypto; a future algorithm change can use a new encoded version and be upgraded after successful login.

## Sessions and account security
Session cookies are HTTP-only, Secure in deployed environments, SameSite=Lax and path-wide. The browser receives the opaque token; D1 stores only its SHA-256 hash. Session identity is derived server-side and must never be selected using a client-supplied user ID.

- Add rate limiting to registration, login, verification and password-reset endpoints.
- Enforce CSRF/origin protections on state-changing cookie-authenticated routes.
- Verify Google ID tokens (issuer, audience, signature, expiry and nonce) server-side.
- Do not silently link an existing email account to a Google identity.
- Encrypt provider access/refresh tokens with authenticated encryption and a Worker secret before writing them to D1.
- Never log passwords, session tokens, verification/reset tokens, OAuth codes, or provider tokens.
- Derive the user ID from the authenticated session for every personal-data query.
- Do not grant admin to the first registered account.

## Deliberately not enabled yet
No registration/login endpoints, Google callback, email delivery, OAuth token exchange, UI, or D1 deployment is enabled by this hashing change. Password hashing is implemented as a reusable primitive; it is not yet connected to registration or login. Existing `/api/v1/me` remains unauthenticated until the complete login/session-creation flow is implemented.
