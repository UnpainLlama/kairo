# Kairo account architecture — Phase 1

## Product decisions
- Open email/password registration; Google OIDC remains a separate future flow.
- Public catalogue browsing is anonymous; personal features are session-scoped.
- Existing `user_profiles` remains the Kairo user record. Never auto-merge identities by email.

## Passwords and sessions
- PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random salt and 256-bit output via Workers Web Crypto.
- Passwords require at least 12 Unicode code points and are capped at 1,024 UTF-8 bytes. No trimming or normalization.
- Session cookies are HttpOnly, Secure on HTTPS, SameSite=Lax; D1 stores only a SHA-256 hash of the opaque token.

## Registration and email verification
- `POST /api/v1/auth/register` creates a profile, email identity, password credential and one-day verification token.
- `POST /api/v1/auth/verify-email` consumes the token once. The email opens `/verify-email?token=...`; the SPA then POSTs it, avoiding link-scanner GET consumption.
- `POST /api/v1/auth/resend-verification` rotates pending tokens and returns a non-enumerating response.
- `POST /api/v1/auth/login` creates a session only after correct credentials and verified email.
- Rate limits use hashed per-action/IP/identity D1 buckets.
- Transactional email uses Resend. Configure Worker secret `RESEND_API_KEY`, sender var `AUTH_EMAIL_FROM`, and `APP_BASE_URL`. Do not commit API keys.

## Deployment requirements
Apply `0003_accounts.sql` and `0004_auth_rate_limits.sql` before deploying. Verify the Resend sender domain and configure `RESEND_API_KEY` and `AUTH_EMAIL_FROM` in each environment. No migration or deployment is performed by this code change. Google OIDC, password reset and account linking remain future work.
