# Kairo account architecture — Phase 1

## Product decisions
- Open email/password registration; Google OIDC sign-in is a separate identity provider.
- Email verification and email delivery are intentionally disabled for the initial launch.
- Public catalogue browsing is anonymous; personal features are session-scoped.
- Existing `user_profiles` remains the Kairo user record. Never auto-merge identities by email.
- An email/password account can connect Google only from an authenticated, recently created session. If a Google sign-in email matches an existing account, the user must sign in to that account and explicitly connect Google in Settings.

## Passwords and sessions
- PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random salt and 256-bit output via Workers Web Crypto.
- Passwords require at least 12 Unicode code points and are capped at 1,024 UTF-8 bytes.
- Session cookies are HttpOnly, Secure on HTTPS, SameSite=Lax; D1 stores only a SHA-256 hash of the opaque token.
- Registration creates an active account and signs the user in immediately.
- Login verifies the password and creates a session. Suspended accounts cannot sign in.

## Google OpenID Connect
- Authorization-code flow with state, nonce, and PKCE S256. State, nonce, and verifier are stored server-side in D1; state is single-use and expires after 10 minutes.
- The Worker validates the ID token RS256 signature against Google's published signing keys, plus issuer, audience, expiry, issued-at, nonce, subject, and verified email.
- Only the Google subject is used as the provider identity. A verified matching email never triggers an automatic account merge.
- Existing Kairo users connect Google from Settings after a fresh sign-in (session created within 15 minutes). If that Google subject belongs to another Kairo user, linking is rejected. One Google identity per Kairo user.
- Google OAuth client credentials are environment-specific: `GOOGLE_CLIENT_ID` is a Worker variable; `GOOGLE_CLIENT_SECRET` is a Worker secret. The exact callback URI for each environment must be registered in Google Cloud Console: `https://<worker-host>/api/v1/auth/google/callback`.
- Kairo Google sign-in remains identity-only and requests no YouTube permissions. YouTube access is a separate, explicit authorization flow described below.

## YouTube connection
- YouTube is connected only by a signed-in Kairo user from Settings, after a recent session check. It requests only `https://www.googleapis.com/auth/youtube.readonly`; ordinary Google sign-in remains `openid email profile`.
- The authorization-code flow uses state, PKCE S256, a ten-minute one-time transaction, and a transaction bound to both the Kairo user and initiating session hash.
- YouTube access and refresh tokens are encrypted with AES-GCM using the dedicated `YOUTUBE_TOKEN_ENCRYPTION_KEY` Worker secret. Tokens are never returned to the browser or logged. The existing `provider_connections` table stores the encrypted token values and granted scope metadata.
- The callback URI is built from the configured canonical `APP_BASE_URL`, never the incoming request Host header. Register the exact URI for each environment in Google Cloud Console. Staging: `https://kairo-anime-platform-staging.unpainllama.workers.dev/api/v1/auth/youtube/callback`.
- The user can view connection status and disconnect; disconnect removes Kairo's stored connection and attempts Google's token revocation. No YouTube account is linked by email address.
- Migration `0007_youtube_oauth.sql` adds the short-lived OAuth transaction table. Apply it only after the feature branch is reviewed and approved.

## Deployment requirements
Apply migrations `0003_accounts.sql`, `0004_auth_rate_limits.sql`, and `0005_google_oauth.sql` before deploying. Configure Google OAuth credentials in each Worker environment.
Google YouTube API authorization, password reset, and optional email verification remain separate future work.
