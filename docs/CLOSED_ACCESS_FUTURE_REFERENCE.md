# Closed-access API reference (future use only)

**Status: documentation only.** This file records the closed-access API design that was developed after the 15 November 2026 baseline. It does not enable closed access, reintroduce its routes, or change the open-registration behavior in the restored application. The endpoints below are historical implementation references, not guarantees that the routes exist in the current source tree.

## Why this document exists

The application baseline being restored is commit [848994bd0903b794ba97f945b377e83ca58b1d33](https://github.com/UnpainLlama/kairo/commit/848994bd0903b794ba97f945b377e83ca58b1d33), dated 15 November 2026. In that snapshot, email/password registration and Google sign-in were available. Closed access began in the subsequent 17 November work, principally:

- [9ed4c127](https://github.com/UnpainLlama/kairo/commit/9ed4c127351bc9eaa2b24d1b5bc7725caea13e22) — username-based closed-access account preparation.
- [bdf20f9f](https://github.com/UnpainLlama/kairo/commit/bdf20f9fbb38e5365c244a2a34614c1a854c4b16) — public registration and Google sign-in removed; login changed to username/password.
- [8d6d4367](https://github.com/UnpainLlama/kairo/commit/8d6d4367ef7c4a1ff9313e44fd57576e29d4a9eb) — administrator bootstrap/account-management API work and standard-account cap.
- [67c46e0d](https://github.com/UnpainLlama/kairo/commit/67c46e0d6edb0a3241bc6aa5cee99ef064f7c7ce) and [9f383a35](https://github.com/UnpainLlama/kairo/commit/9f383a358f1162e78014883949d4c7bd2beacad4) — later Cloudflare Access identity and invitation-status enforcement.

The source history remains the authoritative implementation record. Use these references before attempting to reuse any behavior.

## Historical local-authentication endpoints

These routes describe the later username/password closed-access implementation.

| Method and path | Purpose |
|---|---|
| `POST /api/v1/auth/login` | Sign in with `username` and `password`; returns a Kairo session cookie. |
| `POST /api/v1/me/password` | Change the current account password. Temporary-password sessions were restricted to this operation, reading `/api/v1/me`, and sign-out. |
| `POST /api/v1/auth/logout` | Revoke the current Kairo session and clear its cookie. |

The login request body was:

```json
{ "username": "member.name", "password": "private passphrase" }
```

The implementation used generic invalid-credential responses, rate limits, password-hash verification, active-account checks, and server-created sessions. The later implementation's password policy required at least five whitespace-separated words, a maximum of 1024 UTF-8 bytes, and a value different from the username. A successful password change revoked other sessions for the same account.

### Deliberately removed public sign-in routes

- `POST /api/v1/auth/register` — public account creation; removed when closed access was introduced.
- Google OIDC sign-in and callback routes — removed from the route registration at the same time.

These are not closed-access routes. They are recorded here because their removal was the key behavior change from the 15 November open-registration baseline. The restored baseline reintroduces its original public registration and Google sign-in behavior.

## Historical administrator API

The later local-account model exposed these administrator-only routes. The implementation returned `404 NOT_FOUND` to callers who were not administrators, rather than disclosing the management endpoints.

| Method and path | Purpose and important behavior |
|---|---|
| `GET /api/v1/admin/console-path` | Return a randomly generated, short-lived administrator-console path (30-minute expiry). |
| `GET /api/v1/admin/accounts` | List active/suspended standard accounts and report the 15-account allocation limit. |
| `POST /api/v1/admin/accounts` | Create a standard account from a username and optional display name. Returns a generated temporary password once and marks password change as required. |
| `POST /api/v1/admin/accounts/:id/enroll` | Enroll a legacy standard profile in username/password authentication without changing its profile ID or owned data. |
| `POST /api/v1/admin/accounts/:id/password` | Reset a standard account password; returns a new temporary password once and revokes that account's sessions. |
| `PATCH /api/v1/admin/accounts/:id/status` | Set a standard account to `active` or `suspended`. Suspending revokes its sessions. |
| `DELETE /api/v1/admin/accounts/:id` | Permanently delete standard-account data only when the request explicitly sets `confirmDataDeletion: true`; retain a minimal identity tombstone. |

Request-body notes:

- Account creation: `{ "username": "member.name", "displayName": "Member Name" }`.
- Enrollment: `{ "username": "member.name" }`.
- Status: `{ "status": "active" }` or `{ "status": "suspended" }`.
- Deletion: `{ "confirmDataDeletion": true }`.

Temporary passwords were generated server-side and returned only in the creation, enrollment, or reset response. They were not intended to be stored or displayed again by the application. Deliver them out of band and require the user to choose a private password at first sign-in.

### First-administrator bootstrap

An early administrator-management phase included a one-time `POST /api/v1/admin/bootstrap` setup flow. It was subsequently removed from the later local username/password architecture. The later approach did not provide a public bootstrap page or bootstrap API: an existing administrator profile had to be provisioned through a separately reviewed operator process using `scripts/set-admin-password.mjs`. Do not assume the bootstrap endpoint exists or revive it without a new security review.

## Historical request gates and account limits

The later closed-site middleware applied a default-deny policy to `/api/v1/*`:

1. Only `POST /api/v1/auth/login` and `POST /api/v1/auth/logout` were public.
2. Other API requests required a valid active Kairo session.
3. A temporary-password session could read `GET /api/v1/me`, call `POST /api/v1/me/password`, or sign out; other API access returned `PASSWORD_CHANGE_REQUIRED`.
4. Administrator handlers required the administrator role.
5. YouTube media and YouTube OAuth routes were administrator-only in that implementation.
6. State-changing API requests required a matching `Origin` or same-origin `Referer`.
7. Login attempts were rate-limited. The account state was checked on the server, not accepted from client-supplied role or account identifiers.

The database layer enforced one administrator and a maximum of 15 active/suspended standard accounts. The later account model used normalized unique usernames and a separate `user_credentials` table. Suspending an account revoked existing sessions; deleted accounts retained a minimal tombstone.

## Cloudflare Access: a separate, earlier integration pattern

The later work also experimented with using Cloudflare Access as an invitation boundary. That version verified the signed `Cf-Access-Jwt-Assertion` using the configured team issuer, audience, expiry, signing key, email and subject. It bound a Kairo profile to the verified email and Access `sub`, and checked that the binding still matched on subsequent requests.

This should not be confused with the later local username/password model: the later `CLOSED_ACCESS_SETUP.md` explicitly treated Cloudflare Access as an optional outer network perimeter, separate from Kairo login, and did not use the Access assertion to create or authenticate Kairo accounts. If this model is reconsidered, choose one identity boundary deliberately; do not combine auto-provisioning and locally issued credentials by accident.

## Schema and migration references

The closed-access work added schema changes after the restored baseline, including:

- `0015_closed_access_usernames.sql` — usernames, one-admin uniqueness and the initial 15-standard-account cap.
- `0018_cloudflare_access_identity_admin_lockout.sql` and `0020_cloudflare_access_subject_binding.sql` — Access email/subject bindings and admin lockout state.
- `0021_reassignable_account_seats.sql` — count active/suspended standard accounts for seat allocation.
- `0023_username_password_auth.sql` — separate password credentials and forced-password-change state.

These migrations and their implementation files are not part of the restored application snapshot. This source rollback does **not** reverse migrations already applied to a remote D1 database, delete account data, change Cloudflare Access policies, or alter Worker secrets. Do not attempt to reverse remote schema or account data as part of a source restoration; handle any future database transition as a separately reviewed operation.

## Re-enablement checklist

Before implementing any closed-access model again:

- Decide whether access is granted by invitations/Cloudflare Access, administrator-created local accounts, or another explicit policy.
- Define the administrator bootstrap and recovery process before restricting registration.
- Review account lifecycle, seat allocation, deletion/tombstones, password resets, session revocation, and data ownership.
- Reconcile the intended routes with the current API contract and front-end UX.
- Review migrations against the actual remote D1 schema; never infer database state from the checked-out migration directory.
- Add tests for anonymous, standard-user, admin, suspended, deleted, and forced-password-change access.
- Deploy only after a separate explicit approval; this document alone changes no runtime behavior.
