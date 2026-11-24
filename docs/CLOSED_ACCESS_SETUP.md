# Cloudflare Access perimeter — separate from Kairo authentication

**Status:** this guide describes the outer Cloudflare Access gate retained by the current deployment configuration. It does not describe Kairo account sign-in. Kairo account authentication now uses local username/password credentials.

## Current security boundary

- Cloudflare Access may protect the staging/production Worker and static application at the edge. The current GitHub Actions deployment validator still requires `ACCESS_ENFORCED=true`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` values for each environment.
- The Worker authentication code on `rebuild/username-password-auth` does not validate `Cf-Access-Jwt-Assertion`, bind an account to an Access email/subject, or automatically create a Kairo profile when an email is allowlisted.
- The Access allow policy controls who can reach the application. It is not the Kairo user database. Every allowed person must also have a Kairo username/password issued by an administrator.
- Do not remove, broaden or change the Access edge application as part of this code change. Edge configuration changes require a separate operator review and explicit approval.

## Staging edge configuration

**Perform configuration only for the staging Worker unless the owner separately approves production work. Do not use Protect all Workers, account-wide protection or an account-wide bypass.**

1. In Cloudflare Workers & Pages, select the staging Worker corresponding to `kairo-anime-platform-staging.unpainllama.workers.dev`.
2. Keep its existing Cloudflare Access Worker application and individual-email Allow policy. Access allowlisting only controls reachability; it does not create a Kairo account.
3. Keep the exact Worker destination overrides for the anonymous health probes and Kairo sign-out path if those are required by the live edge application:

   ```json
   {
     "overrides": [
       { "behavior": "public", "path_pattern": "/api/health" },
       { "behavior": "public", "path_pattern": "/api/ready" },
       { "behavior": "public", "path_pattern": "/api/v1/auth/logout" }
     ]
   }
   ```

   Do not add a wildcard, `/api/*`, `/api/v1/auth/*` or an application-wide Bypass/Everyone policy. Verify signed-out GETs to `/api/health` and `/api/ready` return HTTP 200 JSON with `success: true`. The logout exception allows the Worker to revoke a Kairo session if the outer Access session has expired; the Worker still performs same-origin validation for this state-changing request.
4. Keep the environment values aligned with the actual edge application. The current deploy validator requires `ACCESS_ENFORCED=true` and valid `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` values. These are deployment/perimeter assertions; the username/password Worker does not use them to derive Kairo identity.
5. The deployment workflow also requires live `/api/health` and `/api/ready` probes to be explicitly enabled and verified before it will run a deployment. Do not set `KAIRO_REMOTE_HEALTH_CHECKS_ENABLED=true` until the actual public probes have been tested.

## Kairo account setup is separate

### Administrator credentials

There is no first-administrator web setup page, bootstrap API or bootstrap Worker secret. For an existing active administrator profile, use `scripts/set-admin-password.mjs --user-id <profile-id> --username <new-username>`. It reads the password through a hidden terminal prompt and prints SQL containing only a salted hash; it does not connect to D1 or execute any remote operation.

Review and apply the generated SQL only through the separately approved D1 operator process. It updates the existing administrator profile's username, stores its credential hash and revokes that administrator's sessions. An empty database without an administrator profile requires a separately reviewed database-provisioning operation; the application does not provide a public bootstrap flow.

### Standard accounts

Standard accounts are created or enrolled by an authenticated Kairo administrator, not by adding an email to the Access allowlist. The account-management API returns a temporary password once and requires the user to change it on first sign-in. The current rebuild branch has the account APIs; the full administrator account-management UI remains a later frontend phase.

### Sign-out

Kairo sign-out revokes the Kairo session and clears the `kairo_session` cookie. It does not automatically end the outer Cloudflare Access browser session. A person may remain inside the Access perimeter but must authenticate to Kairo again.

## Operational safety

- No Cloudflare Access application, allowlist, Worker secret, D1 database or deployment is changed by these source updates.
- Keep production values separate from staging. Do not copy a staging AUD tag or team domain into production.
- Do not run remote migrations, create real admin credentials, change edge policy or deploy without a separate explicit operator approval.
