# Closed-access Kairo setup

This branch implements the agreed staging access model:

- Cloudflare Access is the outer entrance to the staging Worker. Only explicitly listed email addresses may enter.
- Cloudflare Access One-time PIN sends a short-lived PIN to each invited email. It is separate from Kairo account authentication.
- Configure individual email addresses in Cloudflare Access. Do not allow an entire Gmail domain, all valid emails, or Everyone.
- The intended allocation is one administrator email plus up to 15 standard-user emails (16 total).
- Kairo's Worker verifies the signed Cloudflare Access application JWT, including RS256 signature, team issuer, application audience, token times, and human identity email. It never trusts a user-supplied email header.
- Every Kairo account is bound to one unique Access email. The Kairo session is also bound to that email and is rejected when the current Access identity differs.
- Invited visitors can browse the catalogue after Cloudflare Access sign-in without entering their Kairo username/password. Each invited email is still assigned an active Kairo profile; Kairo credentials are required only for personal/cloud features.
- The single administrator is provisioned once using a temporary Worker bootstrap secret and a password. The bootstrap completion state is permanent in D1.
- Administrator sign-in does not use Kairo MFA. Five incorrect password attempts within a one-hour window lock the administrator login until an operator manually unlocks it through the Cloudflare D1 console.
- Administrator sessions expire after eight hours; standard-account sessions retain the existing 30-day lifetime.
- The administrator has a separate console, manages standard accounts, and is the only Kairo role allowed to use YouTube features.
- The admin console URL is generated from 256 bits of cryptographic randomness and rotates every 30 minutes. The URL is not an authentication factor; the server-side administrator session remains the access control.
- Playback checkpoints are saved locally every five seconds and synced to D1 every 60 seconds for signed-in users. Important user/lifecycle events flush immediately. Failed cloud writes remain in a local retry queue with exponential backoff.

## Staging-only Cloudflare Access configuration

**Perform these steps only for the staging Worker. Do not use Protect all Workers, account-wide protection, or the Production Worker. Production remains unchanged.**

1. In Cloudflare, open **Workers & Pages** and select the staging Worker corresponding to `kairo-anime-platform-staging.unpainllama.workers.dev`.
2. Open its **Access** tab and choose **Protect this Worker**. Protect the staging Worker (including the URL/preview endpoints that belong to that Worker). Do not select the account-wide option.
3. In Zero Trust, ensure **One-time PIN** is enabled as a login method.
4. In the Worker destination's path overrides, make exactly these two paths public so the repository's credential-free deployment health check can run:
   - `/api/health`
   - `/api/ready`

   These handlers return only a generic health status when Access enforcement is enabled. No other path may be public. Do not create an application-wide Bypass/Everyone policy. Cloudflare documents Worker destination path overrides in its [Access application API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/).
5. Create an **Allow** policy for the protected Worker application. Add each invited email as an individual **Emails** selector value. The policy should contain the administrator's email and only the invited standard-user emails, up to 16 addresses total.
6. Do not use **Emails ending in**, **Email domain**, **Login Methods: One-time PIN** as an Include rule by itself, **Everyone**, or **All valid emails**. The allowlist must identify individual addresses.
7. Set the Access application session duration to 24 hours as the initial setting.
8. In the Access application settings, copy the **Team domain** and **Application Audience (AUD) tag**.
9. Replace the two staging placeholders in `wrangler.jsonc` with the exact values from this Kairo staging Access application:
   - `ACCESS_TEAM_DOMAIN` — the team domain, for example `your-team.cloudflareaccess.com` (use your actual team domain; the Worker accepts the domain with or without `https://`).
   - `ACCESS_AUD` — the AUD tag for this specific Kairo staging Access application.
10. Commit those two values to the staging feature branch before deploying. Wrangler treats its configuration as the source of truth and can overwrite dashboard-only variables on the next deploy. The staging deploy workflow now refuses to deploy while either placeholder remains. Do not add the AUD tag or team domain to production configuration.
11. The staging Wrangler configuration sets `ACCESS_ENFORCED=true`. The Worker fails closed for API requests if the team domain or AUD tag is missing or if the Access assertion is absent/invalid.

Cloudflare Access protects the static application and the `workers.dev` URL at the perimeter. The Worker independently validates the signed `Cf-Access-Jwt-Assertion` for API requests. The application JWT must be for this exact Access app. Do not rely on a plain email header or on a browser-provided value.

## User invitation and account binding

1. Add an invited email to the exact-email Cloudflare Access policy.
2. In Kairo's administrator console, create the standard account and supply the same approved email address, username, display name, and password.
3. Share the Kairo username and password with the intended user through a separate secure channel.
4. The user opens the staging URL, enters their email at Cloudflare's Access screen, receives a PIN, and completes Access sign-in. They can browse the catalogue without signing in to Kairo, or enter their Kairo username/password for personal features.
5. To change the email assigned to an existing Kairo account, use **Change approved email** in the administrator console. This revokes the account's existing Kairo sessions. Add the new email to the Cloudflare Access policy and remove the old one if it should no longer enter the site.
6. Existing accounts created before the email-binding migration have no `access_email`. Assign an approved email to each account in the administrator console before that user attempts Kairo sign-in.

Cloudflare's allowlist and Kairo's active-account email mapping are separate controls. Adding an email to a Kairo account does not automatically update Cloudflare Access; the operator must keep both lists aligned. The Worker checks the signed Access identity against an active Kairo profile on every API request. This is necessary because Cloudflare identity-based email selectors are evaluated at login, not continuously during an already-issued application session.

To disable an invited user immediately:
1. Use the Kairo administrator console to suspend their account. This revokes their Kairo sessions and the Worker immediately rejects their Access identity on API requests, including catalogue APIs, even if their Cloudflare application token has not expired.
2. Remove that exact email from the Cloudflare Access Allow policy so they cannot obtain a new Access application session.
3. For immediate edge-level session revocation as well, go to **Zero Trust → Team & Resources → Users**, select the user, and choose **Action → Revoke**. Cloudflare notes that revocation can take 20–30 seconds to invalidate previously issued tokens.

If you only remove an email from the Access policy, an already-issued Access application token can remain usable for the rest of its configured session. The Kairo-side active-account check is therefore the immediate in-app off switch.

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

   `npx wrangler d1 migrations apply kairo-db-staging --remote --env staging`

4. Generate a one-time bootstrap token with at least 32 bytes of cryptographic randomness:

   `openssl rand -hex 32`

   Store the output as a staging Worker **Secret** named `ADMIN_BOOTSTRAP_TOKEN`. Do not add it to `wrangler.jsonc`, source control, browser code, issue comments, or shell history. The Access team domain and AUD are not secrets; configure those as ordinary staging Worker variables.

5. While signed into Cloudflare Access using the administrator's allowlisted email, open the staging site's `/login?setup=admin` page. Enter the temporary bootstrap token, administrator username, display name, approved email address, and a strong unique password. The email entered in the form must match the verified Cloudflare Access identity on the request.
6. The bootstrap endpoint creates the admin profile, Access email binding, email/password identity, and password hash; records permanent bootstrap completion in D1; creates an eight-hour admin session; and returns the current admin console path.
7. Immediately delete the `ADMIN_BOOTSTRAP_TOKEN` staging Worker secret after successful provisioning. The D1 completion marker permanently closes the setup endpoint even if the administrator record is later changed or removed.
8. Verify that the administrator can sign in only from the assigned Access email and that the console path rotates every 30 minutes.
9. Deploy to staging only after the migration and security tests have been reviewed and explicitly approved. Do not deploy production as part of this work.

## Administrator lockout and manual recovery

The administrator password is protected by an account-wide failure counter, not a per-IP counter. Five incorrect password attempts inside the current one-hour failure window lock administrator sign-in. The lock remains in place until manually cleared; waiting for the hour to pass does not unlock it. When the fifth failure triggers the lock, all existing Kairo administrator sessions are revoked and session resolution checks the lock state as a second enforcement layer. The lock applies only to Kairo administrator password login and does not lock out standard users or the Cloudflare dashboard.

To unlock the administrator:

1. Sign into the Cloudflare dashboard with your Cloudflare operator account.
2. Open **Workers & Pages → D1 → kairo-db-staging → Console**. Confirm the database name is `kairo-db-staging`; do not select production.
3. In the D1 console, first revoke any administrator sessions so the operator always signs in again after recovery:

   ```sql
   DELETE FROM sessions
   WHERE user_id IN (SELECT id FROM user_profiles WHERE role = 'admin');
   ```

4. Then clear the lock:

   ```sql
   UPDATE admin_login_security
   SET failed_attempts = 0,
       window_started_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
       locked_at = NULL,
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
   WHERE singleton_id = 1;
   ```

5. Return to the staging site and sign in with the administrator's assigned Cloudflare Access email, Kairo username, and password.

Keep the Cloudflare account itself protected with a strong unique password and its own MFA. The D1 console is the emergency unlock path; never expose an unlock endpoint in the public Kairo interface.

## Remaining security work before production

- Kairo administrator MFA is intentionally not included in this design. Password-only Kairo administrator authentication is a consciously accepted risk, not an ASVS Level 2 MFA implementation.
- The current PBKDF2 workerd compatibility ceiling (100,000 iterations) remains below OWASP's PBKDF2 recommendation. A stronger, benchmarked password-hashing design is still required before production.
- New passwords for first-admin setup, account creation and password resets now require at least 15 Unicode code points (existing passwords remain usable until reset). A common/breached-password blocklist is still outstanding.
- Login performs a dummy PBKDF2 verification for unknown, suspended or wrong-Access-identity accounts to reduce username timing differences. Mutating login/admin requests require a matching Origin or Referer; administrator bootstrap attempts are rate-limited by source IP.
- Static assets now receive baseline security headers from `public/_headers`. A complete CSP remains deferred because the video player embeds several external providers; headers and embed compatibility need live staging verification.
- Session idle timeout and broader CSRF defence for all state-changing routes remain outstanding, as do administrator recovery/credential rotation beyond the documented manual D1 unlock.
- Cloudflare Access dashboard configuration, actual allowed email entries, team domain, AUD tag, live response headers, and D1 state must be verified in the staging environment. Source-code changes alone do not create the Access application or populate its allowlist.
- No migration, Worker secret, Cloudflare Access policy, or deployment is performed by the code change itself.
