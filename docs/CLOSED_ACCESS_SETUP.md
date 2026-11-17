# Closed-access Kairo setup

This branch implements the agreed closed-access model:

- No public registration or Google sign-in.
- Fifteen standard accounts maximum, plus one separate administrator account.
- Standard accounts use administrator-issued username/password credentials.
- Administrator login uses an emailed one-time code; an administrator password is not accepted for normal login.
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

3. Apply the additive migrations to the staging D1 database only:

   `npx wrangler d1 migrations apply DB --remote --env staging`

4. Generate a bootstrap token with at least 32 bytes of cryptographic randomness and store it as a staging Worker secret:

   `npx wrangler secret put ADMIN_BOOTSTRAP_TOKEN --env staging`

5. Create the dedicated Proton Mail mailbox. Store its address as a staging Worker secret:

   `npx wrangler secret put ADMIN_EMAIL --env staging`

6. Create a Resend account using that same Proton address and create a sending API key. Store the key as a staging Worker secret:

   `npx wrangler secret put RESEND_API_KEY --env staging`

   The Worker defaults to `Kairo Security <onboarding@resend.dev>`. Resend's test sender can deliver only to the email address associated with your Resend account, so use the same Proton address for both accounts during this single-admin setup. To send to a different recipient, you must control and verify a sending domain in Resend, then set `AUTH_EMAIL_FROM` to an address on that verified domain:

   `npx wrangler secret put AUTH_EMAIL_FROM --env staging`

   The free Resend plan currently lists 3,000 emails/month and a 100-email daily limit. See [Resend pricing](https://resend.com/pricing).

7. Generate a separate 32-byte random HMAC pepper and store it as a staging Worker secret:

   `npx wrangler secret put ADMIN_OTP_PEPPER --env staging`

8. Provision the administrator by POSTing to the staging endpoint `/api/v1/admin/bootstrap`, sending the bootstrap token in the `X-Kairo-Bootstrap` header and JSON containing only `username` and `displayName`. The administrator does not receive a password credential; login is email-code based. Do not place the bootstrap token in source control, issue comments, or shell history.
9. Remove the `ADMIN_BOOTSTRAP_TOKEN` staging secret immediately after successful provisioning.
10. Verify the full admin email-code login, the 30-minute URL rotation, account creation/suspension/reactivation/password reset, and the YouTube restrictions.
11. Verify playback restore, local checkpointing, 60-second cloud sync, retry after offline/reconnect, stale-write ordering, and completion behavior.
12. Deploy to staging only after the migration and security tests have been reviewed and explicitly approved. Do not deploy production as part of this work.

## Email delivery notes

- The Proton mailbox is the recipient/inbox; Proton does not need to send mail from the Worker.
- Resend sends the one-time code through its REST API. The free tier is subject to Resend's current sending limits and account/domain verification rules.
- The test sender `onboarding@resend.dev` is restricted to the email address associated with your Resend account. Register Resend using the same Proton mailbox configured as `ADMIN_EMAIL`; this supports the single-admin setup without owning a domain. To send to a different recipient, verify a domain you control and use a sender on that domain. For unrestricted delivery, configure a verified domain you control and set `AUTH_EMAIL_FROM`.
- The recipient address, API key, and HMAC pepper are Worker secrets, never frontend variables.
- The one-time code is eight digits, expires after five minutes, is single-use, and has a five-attempt challenge limit. Requests are rate-limited both per IP and per administrator.
- Administrator sessions expire after eight hours; standard-account sessions retain the existing 30-day lifetime.
- `ADMIN_EMAIL` is fixed by the Worker secret and cannot be changed from the admin panel. Change it only through an authorized staging secret update after verifying access to the new mailbox.

## Security notes

- A random console URL is an additional obscurity layer, not authorization. All admin APIs still require a valid server-side admin session.
- The active console path is stored in D1 and rotated by the staging-only Cron Trigger every 30 minutes. The authenticated console-path endpoint can also provision a fresh path after expiry.
- Noindex is only a crawler hint, not access control.
- The first admin is created only with the bootstrap secret; the database partial unique index enforces a single admin role. A database trigger also enforces the 15-standard-account cap, including suspended and deleted accounts.
- Standard account allocation counts suspended and deleted accounts toward the 15-account cap; reactivating a suspended account does not allocate a new slot.
- No migration, Worker secret, or deployment is performed by the code change itself.
