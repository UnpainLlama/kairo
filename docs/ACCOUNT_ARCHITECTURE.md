# Kairo account architecture — Phase 1

## Product decisions
- Open email/password registration; Google OIDC remains a separate future flow.
- Email verification is intentionally disabled for the initial launch; a new email/password account is active and signed in immediately.
- Public catalogue browsing is anonymous; personal features are session-scoped.
- Existing `user_profiles` remains the Kairo user record. Never auto-merge identities by email.

## Passwords and sessions
- PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random salt and 256-bit output via Workers Web Crypto.
- Passwords require at least 12 Unicode code points and are capped at 1,024 UTF-8 bytes. No trimming or normalization.
- Session cookies are HttpOnly, Secure on HTTPS, SameSite=Lax; D1 stores only a SHA-256 hash of the opaque token.
- Registration creates a session immediately after storing the profile, email identity and password credential.
- Login verifies the password and creates a session. Suspended accounts cannot sign in.
- Rate limits use hashed per-action/IP/identity D1 buckets.

## Deployment requirements
Apply `0003_accounts.sql` and `0004_auth_rate_limits.sql` before deploying. Email delivery configuration is not required for email/password registration.
Google OIDC, password reset, account linking and optional future email verification remain future work.
