# Kairo account architecture — closed-access model

This document describes the current closed-access branch. Public registration and Google sign-in are disabled. Do not follow older setup notes that describe open registration.

## Product and access decisions

- Cloudflare Access is the outer entrance for the staging site. Its Allow policy must contain individual email addresses; it must not allow a whole Gmail domain or Everyone.
- Cloudflare Access uses One-time PIN for invited email addresses. This is perimeter authentication and is separate from Kairo's username/password login.
- The intended access allocation is one administrator email plus up to 15 standard-user email addresses.
- The Worker independently validates the signed `Cf-Access-Jwt-Assertion` for API requests. It checks the RS256 signature against the configured Cloudflare Access team JWKS, exact issuer, Access application audience, token expiry, and verified human identity email.
- Kairo stores a unique `access_email` binding on each profile and session. Login requires the current verified Access email to match the account binding; every authenticated API request checks that the session and current profile still match the request's Access email.
- Invited visitors can browse the catalogue without a Kairo account. A Kairo username/password is required for personal/cloud features.
- Standard-account registration and Google sign-in are disabled. The administrator provisions up to 15 standard username/password accounts and assigns each a unique Access email.
- The first administrator is provisioned once with a temporary `ADMIN_BOOTSTRAP_TOKEN`. The administrator's email binding is derived from the verified Access assertion, not a client-supplied identity header. A permanent D1 completion marker prevents the bootstrap flow from reopening.
- Kairo administrator MFA is intentionally not implemented in this design. Administrator password sign-in has an account-wide threshold of five incorrect passwords in a one-hour window; it then remains locked until an operator clears the lock row in the staging D1 console. This is a risk acceptance and does not satisfy ASVS Level 2 MFA.
- The administrator has a separate console and is the only Kairo role allowed to use YouTube features. The console path rotates every 30 minutes as an additional obscurity layer, never as an authorization control.

## Passwords and sessions

- Password hashes currently use PBKDF2-HMAC-SHA-256 with 100,000 iterations, a 16-byte random salt and a 256-bit output. This is below OWASP's current PBKDF2 recommendation. Cloudflare workerd has a documented Web Crypto PBKDF2 iteration ceiling in the current runtime range; this must be re-benchmarked and addressed with a stronger supported KDF design before production.
- Raw passwords are never stored. Password verification uses the encoded algorithm parameters and a constant-time derived-key comparison.
- Password policy and breached/common-password blocklisting still require remediation. See `docs/CLOSED_ACCESS_SETUP.md`.
- Session tokens are 256-bit cryptographically random opaque values. D1 stores only the SHA-256 hash of the token.
- Session cookies are HttpOnly, SameSite=Lax, Path=/, and Secure on HTTPS. Cookie prefix hardening and a server-enforced idle timeout remain follow-up work.
- Administrator sessions expire after eight hours; standard sessions expire after 30 days. Session lookup checks account status, session expiry, and—when Access is enforced—the stored session email against the current signed Access identity and current profile email binding.
- Changing a standard account's Access email or password revokes its sessions. Suspending an account also revokes sessions. Removing an email from Cloudflare Access blocks that identity from the entire site; suspending a Kairo account alone only disables its Kairo account features and does not edit the Cloudflare allowlist.
- A permanent administrator bootstrap-completion marker is stored in D1. Removing the temporary Worker secret after initial setup is still required operational housekeeping.

## YouTube connection

- YouTube is available only to the Kairo administrator. Server-side middleware and route handlers enforce the role; hiding the navigation item is not the security boundary.
- YouTube uses a separate, explicit Google authorization flow and does not restore Google sign-in for Kairo itself.
- It requests only `https://www.googleapis.com/auth/youtube.readonly`.
- The authorization-code flow uses state, PKCE S256, a short-lived one-time transaction, and a transaction bound to the Kairo user and initiating Kairo session.
- YouTube access and refresh tokens are encrypted with AES-GCM using the dedicated `YOUTUBE_TOKEN_ENCRYPTION_KEY` Worker secret. Tokens are never returned to the browser or logged.
- The callback URI is built from the configured canonical `APP_BASE_URL`, never the incoming request Host header. Staging callback: `https://kairo-anime-platform-staging.unpainllama.workers.dev/api/v1/auth/youtube/callback`.
- The user can view connection status and disconnect; disconnect removes Kairo's stored connection and attempts Google's token revocation.

## Staging deployment requirements

- Apply migrations in order on staging only, including `0015_closed_access_usernames.sql`, `0016_playback_write_order.sql`, `0017_admin_email_otp_console_rotation.sql`, and `0018_cloudflare_access_identity_admin_lockout.sql`.
- Configure Cloudflare Access on the staging Worker only. Use an Allow policy with individually specified email addresses, One-time PIN, and a 24-hour Access session. Do not use Protect all Workers or change the Production Worker.
- Set staging Worker variables `ACCESS_ENFORCED=true`, `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD`. The team domain and AUD are public configuration values; the Worker fails closed when enforcement is enabled but either is missing.
- Store `ADMIN_BOOTSTRAP_TOKEN` as a staging Worker secret. Remove it immediately after first administrator creation.
- The admin console lockout recovery procedure is in `docs/CLOSED_ACCESS_SETUP.md`. Use the staging D1 database only.
- Verify the Cloudflare email allowlist and Kairo `access_email` bindings agree. They are maintained separately; changing one does not automatically update the other.
- Do not configure or deploy production as part of the staging rollout.
