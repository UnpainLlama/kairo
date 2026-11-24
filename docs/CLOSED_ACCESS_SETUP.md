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

### First administrator

1. Generate a one-time token with at least 32 cryptographically random bytes (for example, `openssl rand -hex 32`).
2. Store it as a Worker **Secret** named `ADMIN_BOOTSTRAP_TOKEN`. Do not put it in source control, `wrangler.jsonc`, browser code or shell history.
3. After the reviewed code and additive migration have been deployed/applied through the approved process, open `/setup/admin` and enter the one-time token, the desired administrator username and a unique password of at least 15 characters.
4. The app sends the token in `X-Kairo-Bootstrap`. The Worker creates one administrator, stores only a salted password hash, sets the permanent D1 bootstrap-completion marker and creates a Kairo session.
5. Remove the Worker secret immediately after successful setup. Do not create an administrator account as part of code validation.

### Standard accounts

Standard accounts are created or enrolled by an authenticated Kairo administrator, not by adding an email to the Access allowlist. The account-management API returns a temporary password once and requires the user to change it on first sign-in. The current rebuild branch has the account APIs; the full administrator account-management UI remains a later frontend phase.

### Sign-out

Kairo sign-out revokes the Kairo session and clears the `kairo_session` cookie. It does not automatically end the outer Cloudflare Access browser session. A person may remain inside the Access perimeter but must authenticate to Kairo again.

## Operational safety

- No Cloudflare Access application, allowlist, Worker secret, D1 database or deployment is changed by these source updates.
- Keep production values separate from staging. Do not copy a staging AUD tag or team domain into production.
- Do not run remote migrations, create real admin credentials, change edge policy or deploy without a separate explicit operator approval.
