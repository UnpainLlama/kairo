# Kairo account architecture — local username/password

**Status:** username/password authentication is implemented on `rebuild/username-password-auth`. Cloudflare Access remains a separate edge perimeter; it is not the Kairo identity provider.

## Identity and profile ownership

Kairo has one application account shared by Anime, Movies and administrator-only YouTube.

- `user_profiles.id` remains the stable owner ID for account data. Existing profile IDs and account-owned media rows are retained during credential enrollment.
- `user_credentials` is a separate one-to-one table keyed by `user_id`. It stores the password hash and forced-password-change state, not plaintext passwords.
- Usernames are normalized to lowercase. Valid names contain 3–32 ASCII letters, numbers, dots, hyphens or underscores. Reserved names and the `access_*` / `user_*` prefixes are rejected.
- New standard accounts are created only by an administrator. Public registration is disabled and the server enforces a maximum of 15 active/suspended standard accounts.
- Existing standard profiles can be enrolled in place without changing their `user_profiles.id`. Existing Access identity tables and old identity-link records are retained for compatibility/history but are not read by the new login/session path.
- Only one active administrator profile is supported. Kairo does not expose a first-administrator setup page or public bootstrap API.

Account ownership is always derived from the validated server-side Kairo session. Never accept a user ID, role, or account scope from the browser.

## Profile, preferences and lifecycle

- Profile editing is limited to display name, a 280-character bio and explicit private/public visibility. A signed-in viewer can read another user's profile only when it is opted into public visibility; that endpoint returns a small allowlist and never library/history/account identifiers.
- Account preferences are stored per stable profile ID. Current fields include theme, interface language, subtitle language/size, autoplay-next, default playback speed and history pause.
- A user can export account profile, preferences, Anime/Movies library references, watch history and non-YouTube playback state as JSON.
- Standard-account self-deletion requires the current password and a username confirmation. It removes owned rows and credentials, revokes sessions, and retains a minimal `Former account` tombstone. The administrator account cannot self-delete.
- These route/schema changes are source changes only; apply the additive subtitle-size migration through the separately approved deployment process.

## Password policy and storage

- New passwords require at least five whitespace-separated words and no more than 1024 UTF-8 bytes. A password cannot be identical to its username, ignoring case.
- Password hashes are versioned PBKDF2-HMAC-SHA256 values with a random 16-byte salt and a 32-byte derived key. The Worker verifies only explicit allowlisted hash profiles; the legacy v1 format remains readable so a successful login can rehash it to the current format.
- **Current release gate:** hash profile v2 uses 100,000 iterations. This is below OWASP's current 600,000-iteration PBKDF2-HMAC-SHA256 recommendation. Do not treat this as production-approved; benchmark the target Workers plan/CPU budget and raise the cost (or select a suitable alternative) before production. Do not guess the Workers plan or change the cost without measuring the actual runtime.
- Login failures use a generic response for unknown usernames and incorrect passwords. Attempts are rate-limited by IP+username and by IP.
- Temporary passwords generated for standard-account creation/enrollment/reset set `must_change_password=1`. The user must choose a private password before any other account functionality is allowed.

## Sessions

- The browser receives an opaque cryptographically random `kairo_session` cookie with `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS.
- D1 stores only a SHA-256 digest of the session token. The cookie value is never exposed to JavaScript or written to localStorage.
- Administrator sessions have an eight-hour absolute lifetime and 60-minute idle expiry. Standard-account sessions have a 30-day absolute lifetime and 14-day idle expiry.
- A successful password change retains the current session and revokes every other session for that account.
- `POST /api/v1/auth/logout` revokes the current session and clears its cookie. It does not sign the browser out of the separate Cloudflare Access edge session.
- A password-change-required session may only read `/api/v1/me`, change its password or sign out.

## Administrator credential provisioning

- There is no public administrator setup page, bootstrap secret or bootstrap API.
- For an existing active administrator profile, use `scripts/set-admin-password.mjs --user-id <profile-id> --username <new-username>`. The script reads the password through a hidden terminal prompt and prints SQL containing a salted hash; it does not connect to or execute against D1.
- Review and apply that SQL only against the intended database through the separately approved operator process. It changes the existing profile's username, writes its password credential and revokes that administrator's existing sessions.
- A new/empty database without an administrator profile requires a separately reviewed database-provisioning operation; the application intentionally does not offer a first-admin web setup flow. The legacy `app_security_state` row remains part of migration/readiness compatibility, but the recovery utility no longer writes its former bootstrap-completion marker.
- No real administrator credential or remote D1 operation is performed as part of this source change.

## Standard-account administration

Authenticated administrator routes can list accounts, create a standard account, enroll a legacy profile, reset a password, suspend/reactivate an account and delete a standard account.

Creation, enrollment and password reset return a generated temporary password once and require password change at next login. Deliver it to the intended person through a secure channel. Suspending an account revokes its sessions. Deletion requires explicit confirmation and permanently removes account-owned rows while retaining a minimal profile tombstone.

The offline `scripts/set-admin-password.mjs` utility is for recovering/enrolling an existing administrator profile. It reads the password through a hidden interactive terminal prompt and prints SQL containing only a salted hash; it does not connect to or execute against D1.

## Cloudflare Access edge perimeter

The current deployment workflow still requires Cloudflare Access perimeter configuration in staging and production. That is independent of Kairo authentication:

- Cloudflare Access may restrict who can reach the Worker/site at the network edge.
- The Worker does not validate `Cf-Access-Jwt-Assertion`, use Access email as the Kairo username, bind sessions to Access `sub`, or auto-provision profiles from Access allowlist membership.
- A person who passes the outer edge gate must still sign in with a Kairo username and password.
- Do not remove or change the Access application, destination overrides, allowlist or deploy validator as part of a source-only authentication change. Any edge change requires a separate, explicitly reviewed operator action.

## Guest mode and data boundaries

There is no anonymous account or guest API mode in the username/password branch. All `/api/v1/*` routes are denied by default except username/password login and logout. Account library, history and playback data remain owned by the signed-in Kairo profile ID.

