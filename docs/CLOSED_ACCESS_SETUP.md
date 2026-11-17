# Closed-access Kairo setup

This branch implements the agreed closed-access model:

- No public standard-account registration or Google sign-in.
- Fifteen standard accounts maximum, plus one separate administrator account.
- Standard accounts use administrator-issued username/password credentials.
- The first administrator is created once through a bootstrap form using a staging Worker secret and chooses a username and password. The bootstrap endpoint permanently closes once an administrator exists.
- Administrator login uses that username/password and creates an eight-hour session. Standard-account sessions retain the existing 30-day lifetime.
- The administrator has a separate console, manages standard accounts, and is the only role allowed to use YouTube features.
- The admin console URL is generated from 256 bits of cryptographic randomness and rotates every 30 minutes. The URL is not an authentication factor; the server-side administrator session remains the access control.
- Playback checkpoints are saved locally every five seconds and synced to D1 every 60 seconds for signed-in users. Important user/lifecycle events flush immediately. Failed cloud writes remain in a local retry queue with exponential backoff.

## Staging activation only

**Do not run any command below against production.** These steps have not been performed by this code change.

1. Review the branch, reconcile it against the intended staging release, and run typecheck, tests, and build.
2. Before applying migrations, run this read-only preflight against the staging D1 database:

   ```sql
   SELECT role, COUNT(*) AS account_count
   FROM user_profiles
   GROUP BY role;

   SELECT id, account_status
   FROM user_profiles
   WHERE role = 'admin';
   ```

   There must be no existing administrator and no more than 15 standard accounts. Existing standard accounts are backfilled with generated usernames and count toward the 15-account cap. If an administrator already exists or more than 15 standard accounts are present, stop and review the existing accounts before proceeding; do not delete or demote accounts automatically.

3. Apply the additive migrations to the staging D1 database only. The staging database is named `kairo-db-staging` (the Worker binding is `DB`):

   `npx wrangler d1 migrations apply kairo-db-staging --remote --env staging`

4. Generate a one-time bootstrap token with at least 32 bytes of cryptographic randomness and store it as a staging Worker secret:

   `openssl rand -hex 32`

   Then add the output using the Cloudflare dashboard's **Workers & Pages → Kairo staging Worker → Settings → Variables and Secrets → Add → Secret** interface, named `ADMIN_BOOTSTRAP_TOKEN`. Do not add it to `wrangler.jsonc`, source control, or frontend variables.

5. Open the staging site's login page and choose **First-time setup → Create the administrator account** (or visit `/login?setup=admin`). Enter the one-time setup token, administrator username, display name, and a strong unique password of at least 12 characters. The setup endpoint requires the token in a request header, creates the admin profile, email/password identity, password hash, and eight-hour session in one D1 batch, then returns the authenticated admin session.

6. Immediately delete the `ADMIN_BOOTSTRAP_TOKEN` staging Worker secret after successful setup. The database's unique admin constraint and endpoint check prevent a second administrator from being created. If the token remains configured, the endpoint is still closed once an admin exists, but removing it reduces unnecessary exposure.

7. Verify administrator username/password login, the eight-hour session, the 30-minute console URL rotation, account creation/suspension/reactivation/password reset, and the YouTube restrictions.

8. Verify playback restore, local checkpointing, 60-second cloud sync, retry after offline/reconnect, stale-write ordering, and completion behavior.

9. Deploy to staging only after the migration and security tests have been reviewed and explicitly approved. Do not deploy production as part of this work.

## Bootstrap and password notes

- The only new required Worker secret for first-time administrator setup is `ADMIN_BOOTSTRAP_TOKEN`. It is a temporary setup credential, not the administrator's login password.
- The bootstrap form is reachable at `/login?setup=admin`; knowing the URL does not grant setup access. The endpoint checks the 256-bit random token and refuses setup if any admin already exists.
- Choose a strong, unique administrator password and keep it in a password manager. The application stores only a salted PBKDF2 password hash.
- Administrator sessions expire after eight hours; standard-account sessions retain the existing 30-day lifetime.
- If the admin password is lost, do not reopen public signup or manually edit D1 without a reviewed recovery procedure.

## Security notes

- The bootstrap token must never be committed to source control, pasted into chat, or included in a URL. It is submitted over HTTPS in a request header.
- A random console URL is an additional obscurity layer, not authorization. All admin APIs still require a valid server-side administrator session.
- The active console path is stored in D1 and rotated by the staging-only Cron Trigger every 30 minutes. The authenticated console-path endpoint can also provision a fresh path after expiry.
- Noindex is only a crawler hint, not access control.
- The database partial unique index enforces one administrator role. A database trigger also enforces the 15-standard-account cap, including suspended and deleted accounts.
- No migration, Worker secret, or deployment is performed by the code change itself.
