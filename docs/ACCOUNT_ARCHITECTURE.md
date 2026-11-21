# Kairo account architecture — Cloudflare Access identity

**Status:** Access-native closed identity model, November 2026.

## Identity and invitation boundary

Cloudflare Access is Kairo's only interactive sign-in authority.

- Each invited person is given an individual email address to use with the Kairo Cloudflare Access application.
- The Access application's **Allow** policy must list those exact email addresses individually. Never use Everyone, a whole-domain rule, or another broad rule for the Kairo application.
- Cloudflare Access verifies the visitor and issues a signed application JWT. The Worker independently verifies its RS256 signature, issuer, audience, validity window and verified human email.
- A request without a valid Access assertion is rejected before account-scoped API routes run. It is not treated as a guest session.
- A valid Access identity is the invitation proof. On first access, Kairo automatically provisions a standard profile bound to that verified email. No separate Kairo username/password account must be created or supplied.
- Existing profiles are resolved by their unique `access_email`. A legacy profile with a matching verified `email` and no Access binding is linked in place, preserving its existing ID and media data.
- Existing suspended or deleted profiles are never reactivated by signing in. A new standard profile is also refused when the 15-standard-account allocation limit is reached.
- The administrator is a separately provisioned `role='admin'` profile. The one-time bootstrap uses the verified Access email and a temporary `ADMIN_BOOTSTRAP_TOKEN`; it does not create a Kairo password. The permanent D1 bootstrap marker closes the operation after the first admin is created.

**Important security boundary:** first-visit provisioning deliberately trusts only an email from a valid JWT for this exact Cloudflare Access application. The Access Allow policy is therefore the invitation list. A broad or public Access policy would make every identity allowed by that policy eligible for automatic Kairo account creation.

## One sign-in, internal application session

Cloudflare Access authentication is converted into the internal application session needed by existing account and media services:

1. The browser passes through Cloudflare Access using the invited email.
2. The Worker verifies the Access assertion and resolves/provisions the profile.
3. The first `GET /api/v1/me` creates a Kairo HttpOnly, Secure, SameSite=Lax session cookie automatically.
4. Every authenticated API call checks that the session and profile match both the current verified Access email and the immutable Access JWT `sub`, and that the profile remains active.
5. If the internal session expires or is revoked while the Access browser session remains valid, `/api/v1/me` clears the stale Kairo cookie and returns `ACCESS_REAUTH_REQUIRED`; the user must sign out of and back into Cloudflare Access before a new Kairo session is created.

The internal `kairo_session` cookie is an implementation session, not a second user sign-in. It is never exposed to JavaScript or stored in localStorage. The stable `user_profiles.id` resolved by `/api/v1/me` owns Anime, Movies and YouTube account data.

Standard-account provisioning and sign-in are not exposed as a public username/password workflow. The legacy `POST /api/v1/auth/login` endpoint returns `410 ACCESS_SIGN_IN_ONLY`. The former Kairo password fields and password-reset workflow are no longer part of normal account management.

The administrator's eight-hour absolute session and 60-minute idle timeout remain. Standard sessions have a 30-day absolute lifetime and 14-day idle timeout. The server checks account status, current Access email and Access JWT subject on every authenticated API request. The former password-failure lockout does not block an Access-authenticated administrator.

## Guest mode

Guest mode is reserved for local development or an explicitly non-Access environment where `ACCESS_ENFORCED` is not `true`.

- A local-development request with no Kairo session resolves as `guest`.
- Guest Anime history/progress and guest Movies lists remain in isolated browser storage.
- Guest state is never sent to D1 or attached to an account automatically.
- In staging and production, missing or invalid Access identity is an Access denial, not guest mode. An unapproved visitor must not reach the application through the Cloudflare Access application.

Signing in on an Access-protected deployment immediately resolves the profile and uses account-scoped storage. Existing guest data is not silently imported into the account; a separate user-confirmed import would be required to combine them.

## Sign-out and browser cookies

Kairo's signed-in state depends on both the Cloudflare Access identity and the internal Kairo session. Deleting only the Kairo session cookie does not sign a visitor out of Cloudflare Access; a subsequent authenticated `/api/v1/me` request would establish another internal session.

The Kairo sign-out action first calls `POST /api/v1/auth/logout` to revoke the current Kairo session and clear its HttpOnly cookie. Only after that succeeds does the client clear the signed-in account's namespaced local media cache and navigate to `/cdn-cgi/access/logout`, which ends the Cloudflare Access session. The app shell, profile and admin console share this sequence. If server-side revocation fails, the client keeps local data and does not redirect.

Browser-local media data is separate from both cookie layers. Sign-out does not remove guest data or server-side account records. Clearing localStorage alone does not revoke a server-side account.

## Account and media data boundaries

Kairo uses one identity across Anime, Movies and YouTube; the media domains remain separate:

| Media | Account-owned server data | Guest/browser data |
|---|---|---|
| Anime | Library, watch history and progress | Isolated browser history and progress |
| Movies | Watchlist, Watched and Favorites references; playback snapshots | Isolated browser My List and playback snapshots |
| YouTube | Administrator feed settings, history and Watch Later | Guest playback/history state where guest mode is enabled |

Account ownership is always derived from the server-validated session and current Access identity. Never accept a user ID from the browser or request body.

YouTube remains an administrator-only Kairo feature. Its optional Google OAuth connection is a separate authorization to Google's YouTube service; it does not sign the person into Kairo and does not replace Cloudflare Access.

## Operator procedures

### Invite a person

1. Add their exact email to the Kairo Cloudflare Access application's Allow policy.
2. Give the person that email address and have them complete Cloudflare Access One-time PIN sign-in.
3. Kairo automatically creates their standard profile on first successful access, unless an existing active profile is already bound to the email.
4. Verify their profile and role in the administrator console.

Do not create or share a Kairo password.

### Suspend or remove a person

1. Suspend their Kairo profile in the administrator console to block account API access immediately.
2. Remove their email from the Cloudflare Access Allow policy.
3. Revoke their Cloudflare Access session using the Access dashboard or logout process.
4. Do not reactivate a profile merely because the same email can authenticate again; the operator must intentionally reactivate it.

### Reassign a seat to a different person

Do not transfer an existing account by changing its Access email. Use **Reassign seat** in the administrator console only when the seat is changing owners. This permanently removes the previous account's sessions, OAuth state, provider connections, preferences, Anime and Movies libraries, ratings, watch history, YouTube feed/history/Watch Later records, playback progress, deletion markers and other account-owned rows. A new profile with a new user ID and an empty data set is created for the new email; none of the previous person's data is transferred.

The previous profile remains only as a minimal `deleted` identity tombstone holding its former Cloudflare Access email and JWT subject. That prevents an already-issued Access session from automatically provisioning the old identity again. Deleted tombstones do not consume one of the 15 active/suspended standard-account seats, but their old email remains reserved. The reset cannot be undone.

Update the Cloudflare Access Allow policy as part of the handoff: remove the previous person's email and add the new person's exact email. The application-level tombstone blocks the former identity even if an old Access token remains valid. The new person establishes a fresh Kairo session on their first approved visit.

### First administrator setup

The first administrator must complete the one-time bootstrap while already authenticated with the exact intended Cloudflare Access email. The Worker validates the temporary `ADMIN_BOOTSTRAP_TOKEN`, binds the profile to the asserted email, and permanently closes bootstrap. Remove the bootstrap secret immediately after setup. No password is created.

## Related implementation

- Access JWT validation and account resolution: `worker/auth/cloudflareAccess.ts`
- Access middleware and automatic internal session creation: `worker/index.ts`
- Internal HttpOnly sessions: `worker/auth/session.ts`
- Account and role provisioning: `worker/admin/routes.ts`
- Shared browser account state: `src/lib/AccountProvider.tsx`
- Cross-media persistence boundaries: `docs/UNIFIED_MEDIA_SYNC.md`
