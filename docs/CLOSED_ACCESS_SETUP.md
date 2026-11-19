# Closed-access Kairo setup

This branch implements the agreed staging access model:

- Cloudflare Access is the outer entrance to the staging Worker. Only explicitly listed email addresses may enter.
- Cloudflare Access One-time PIN sends a short-lived PIN to each invited email. Successful Access authentication is the user's Kairo sign-in; there is no second Kairo username/password process.
- Configure individual email addresses in Cloudflare Access. Do not allow an entire Gmail domain, all valid emails, or Everyone.
- The intended allocation is one administrator email plus up to 15 standard-user emails (16 total).
- Kairo's Worker verifies the signed Cloudflare Access application JWT, including RS256 signature, team issuer, application audience, token times, and human identity email. It never trusts a user-supplied email header.
- Every Kairo account is bound to one unique Access email. The Kairo session is bound to both the verified Access email and JWT subject and is rejected when either current identity value differs.
- On first successful Access visit, Kairo automatically provisions a standard profile from the verified email. Existing profiles are restored/linked; suspended or deleted profiles are not reactivated. The 15-standard-account limit still applies.
- The first administrator is provisioned once using a temporary Worker bootstrap secret and the verified Access email; no Kairo password is created. The bootstrap completion state is permanent in D1.
- There is no Kairo username/password sign-in or password-based admin lockout. Cloudflare Access is the only interactive authentication layer. The Worker still enforces the administrator role for YouTube and console routes.
- Administrator sessions expire after eight hours; standard-account sessions retain the existing 30-day lifetime.
- The administrator has a separate console, manages standard accounts, and is the only Kairo role allowed to use YouTube features.
- The admin console URL is generated from 256 bits of cryptographic randomness and rotates every 30 minutes. The URL is not an authentication factor; the server-side administrator session remains the access control.
- Playback checkpoints are saved locally every five seconds and synced to D1 every 60 seconds for signed-in users. Important user/lifecycle events flush immediately. Failed cloud writes remain in a local retry queue with exponential backoff.

## Staging-only Cloudflare Access configuration

**Perform these steps only for the staging Worker. Do not use Protect all Workers, account-wide protection, or the Production Worker. Production remains unchanged.**

1. In Cloudflare, open **Workers & Pages** and select the staging Worker corresponding to `kairo-anime-platform-staging.unpainllama.workers.dev`.
2. Open its **Access** tab and choose **Protect this Worker**. Protect the staging Worker (including the URL/preview endpoints that belong to that Worker). Do not select the account-wide option.
3. In Zero Trust, ensure **One-time PIN** is enabled as a login method.
4. Keep `/api/health` and `/api/ready` protected by default. Before enabling a deployment environment, configure exact Worker destination path overrides for only those two paths, verify that they return the minimal health/readiness JSON without exposing private account data, then set the GitHub environment variable `KAIRO_REMOTE_HEALTH_CHECKS_ENABLED=true`. The deploy workflow now blocks deployments unless this live verification is enabled and both probes succeed. Do not create an application-wide Bypass/Everyone policy.

   Do not create an application-wide Bypass/Everyone policy. Cloudflare documents Worker destination path overrides in its [Access application API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/).
5. Create an **Allow** policy for the protected Worker application. Add each invited email as an individual **Emails** selector value. The policy should contain the administrator's email and only the invited standard-user emails, up to 16 addresses total.
6. Do not use **Emails ending in**, **Email domain**, **Login Methods: One-time PIN** as an Include rule by itself, **Everyone**, or **All valid emails**. The allowlist must identify individual addresses.
7. Set the Access application session duration to 24 hours as the initial setting.
8. In the Access application settings, copy the **Team domain** and **Application Audience (AUD) tag**.
9. Replace the two staging placeholders in `wrangler.jsonc` with the exact values from this Kairo staging Access application:
   - `ACCESS_TEAM_DOMAIN` — the team domain, for example `your-team.cloudflareaccess.com` (use your actual team domain; the Worker accepts the domain with or without `https://`).
   - `ACCESS_AUD` — the AUD tag for this specific Kairo staging Access application.
10. Commit those two values to the staging feature branch before deploying. Wrangler treats its configuration as the source of truth and can overwrite dashboard-only variables on the next deploy. The staging deploy workflow now refuses to deploy while either placeholder remains. Production has separate Access placeholders and must use its own Access application, team domain and AUD tag; do not copy the staging app's AUD tag into production. Production deployment remains blocked until that separate setup is completed and explicitly approved.
11. The staging Wrangler configuration sets `ACCESS_ENFORCED=true`. The Worker fails closed for API requests if the team domain or AUD tag is missing or if the Access assertion is absent/invalid.

Cloudflare Access protects the static application and the `workers.dev` URL at the perimeter. The Worker independently validates the signed `Cf-Access-Jwt-Assertion` for API requests. The application JWT must be for this exact Access app. Do not rely on a plain email header or on a browser-provided value.

## User invitation and account binding

1. Add the person's exact email address to the Kairo Cloudflare Access application's Allow policy.
2. Give the person that email address. They open the Kairo URL and complete Cloudflare Access One-time PIN sign-in.
3. On the first approved visit, the Worker automatically creates a standard Kairo profile for that verified email and `/api/v1/me` creates the internal HttpOnly session. No separate Kairo username/password is issued.
4. Existing active profiles are restored by their Access email. A legacy profile with a matching email and no Access binding is linked in place, preserving its user ID and media data. Suspended/deleted profiles remain blocked.
5. The standard account allocation limit is 15. If the limit is reached, provisioning fails closed; free a slot or review the existing allocation before inviting another standard user.

The Cloudflare Access Allow policy is the invitation list. Adding an email to this policy authorizes first-visit Kairo provisioning; therefore the policy must contain only individual intended email addresses. Do not use a Gmail-domain rule, Everyone, or all valid emails.

To change an existing user's email, update the Kairo Access email binding and the Cloudflare Access Allow policy together. The two are separate controls. Changing the Kairo binding revokes existing Kairo sessions.

To disable an invited user immediately:
1. Suspend their Kairo profile in the administrator console. This blocks account APIs immediately, even if their Cloudflare token has not expired.
2. Remove that exact email from the Cloudflare Access Allow policy so they cannot obtain a new Access application session.
3. Revoke their Cloudflare Access session from the Zero Trust dashboard where immediate edge-level revocation is required. Cloudflare notes that revocation can take 20–30 seconds.

Kairo's menu Sign out action navigates to `/cdn-cgi/access/logout`. Deleting only the internal Kairo cookie is not a full sign-out because a still-valid Cloudflare Access identity would allow `/api/v1/me` to create another internal session.

## Database migration and first administrator setup

**Do not run any command below against production.** These steps have not been performed by this code change.

1. Review the branch, reconcile it against the intended staging release, and run typecheck, tests, and build.
2. Before applying migrations, run this read-only preflight against the staging D1 database:

   ```sql
   SELECT role, COUNT(*) AS account_count
   FROM user_profiles
   GROUP BY role;

   SELECT id, account_status, access_email
   FROM user_profiles
   WHERE role = 'admin';
   ```

   There must be no existing administrator and no more than 15 standard accounts. Existing standard accounts are backfilled with generated usernames and count toward the 15-account cap. If an administrator already exists or more than 15 standard accounts are present, stop and review the existing accounts before proceeding; do not delete or demote accounts automatically.

3. Apply the additive migrations to the staging D1 database only. The staging database is named `kairo-db-staging` (the Worker binding is `DB`):

   `npx wrangler d1 migrations apply DB --remote --env staging`

4. Generate a one-time bootstrap token with at least 32 bytes of cryptographic randomness:

   `openssl rand -hex 32`

   Store the output as a staging Worker **Secret** named `ADMIN_BOOTSTRAP_TOKEN`. Do not add it to `wrangler.jsonc`, source control, browser code, issue comments, or shell history. The Access team domain and AUD are not secrets; configure those as ordinary staging Worker variables.

5. While signed into Cloudflare Access using the administrator's allowlisted email, open the staging site's `/login?setup=admin` page. Enter the temporary bootstrap token and (optionally) a display name. The verified Access email on the request is the admin identity; there is no username or password form.
6. The bootstrap endpoint creates the admin profile and Access email binding; records permanent bootstrap completion in D1; creates an eight-hour internal admin session; and returns the current admin console path.
7. Immediately delete the `ADMIN_BOOTSTRAP_TOKEN` staging Worker secret after successful provisioning. The D1 completion marker permanently closes the setup endpoint even if the administrator record is later changed or removed.
8. Verify that the administrator can sign in only from the assigned Access email and that the console path rotates every 30 minutes.
9. Deploy to staging only after the migration and security tests have been reviewed and explicitly approved. Do not deploy production as part of this work.

## Administrator access recovery

There is no longer a Kairo administrator password or password-failure lockout. If the administrator cannot enter Kairo:

1. Confirm the administrator's exact email remains in the Kairo Cloudflare Access application's Allow policy.
2. Confirm the admin profile is active and its `access_email` matches the verified email.
3. Check that staging `ACCESS_ENFORCED`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are correct.
4. Use Cloudflare Access logout at `/cdn-cgi/access/logout`, then authenticate again with the intended administrator email.
5. If the account was suspended, deliberately reactivate it in Kairo and ensure the exact email is again included in the Cloudflare Access policy.

Do not clear or edit the legacy `admin_login_security` table as an authentication recovery step. It belongs to the retired password-login design and is not used to authorize Access-native sessions.

## Remaining security work before production

- Kairo user sign-in is delegated to Cloudflare Access and its One-time PIN identity method. The Worker still validates the signed application JWT and binds each internal session to the verified email. Administrator MFA is therefore governed by the configured Cloudflare Access authentication policy; verify its current MFA/reauthentication settings before production.
- The GitHub Actions dependency audit reports no production dependency vulnerabilities after moving `@vitejs/plugin-react` into `devDependencies`. The full build/test toolchain audit still reports five high-severity package findings, led by `picomatch` versions through 4.0.7 (GHSA-fc5q-39xc-vjpf / CVE-2026-112366). The [GitHub advisory for picomatch](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) (CVE-2026-112366) currently does not identify a patched release; npm's suggested Vite 6.2.7 and Vitest 3.1.4 changes are major downgrades and were not applied. The CI report and weekly Dependabot updates remain enabled.
- Legacy password-hash tables and password utilities remain in the additive schema/code history for compatibility; new Kairo profiles do not receive password credentials and the normal login route returns 410. All state-changing API requests (POST, PUT, PATCH and DELETE) require a matching Origin or Referer; administrator bootstrap attempts are additionally rate-limited by source IP.
- Static assets now receive baseline security headers from `public/_headers`. A complete CSP remains deferred because the video player embeds several external providers; headers and embed compatibility need live staging verification.
- Session idle expiry is enforced server-side: administrators are idle-expired after 60 minutes, standard accounts after 14 days; successful requests refresh activity at most once every five minutes. The absolute limits remain eight hours for administrators and 30 days for standard users. A tailored CSP still needs video embed compatibility testing.
- Cloudflare Access dashboard configuration, actual allowed email entries, team domain, AUD tag, live response headers, and D1 state must be verified in the staging environment. Source-code changes alone do not create the Access application or populate its allowlist.
- No migration, Worker secret, Cloudflare Access policy, or deployment is performed by the code change itself.
