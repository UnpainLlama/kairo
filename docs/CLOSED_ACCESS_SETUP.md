# Closed-access Kairo setup

This change set implements the closed-access account model:

- No public registration endpoint or Google sign-in route.
- Username/password login for pre-provisioned accounts.
- One administrator account, enforced by a partial unique D1 index.
- Up to 15 standard accounts. Suspended accounts still count toward the allocation limit.
- The administrator can create accounts, suspend/reactivate them, and reset passwords.
- YouTube pages, OAuth routes, search, metadata, feed, history, and Watch Later are administrator-only at the Worker layer.
- The admin console is available at the private path supplied by the owner. The path is an additional obscurity measure, not an authentication mechanism.

## Staging activation checklist

Do not run these steps against production.

1. Review the code branch and run the repository build and tests.
2. Apply the new migration to the staging D1 database only:

   npx wrangler d1 migrations apply DB --remote --env staging

3. Generate a fresh random bootstrap token with at least 32 bytes of entropy. Store it as a Cloudflare Worker secret for the staging environment:

   npx wrangler secret put ADMIN_BOOTSTRAP_TOKEN --env staging

4. Provision the first administrator by POSTing to the staging Worker endpoint /api/v1/admin/bootstrap, sending the bootstrap token in the X-Kairo-Bootstrap header and a JSON body containing username, displayName, and a newly generated password. Do not put the token or password in source control, issue comments, or shell history.
5. Verify that the administrator can sign in, reach the private console, create a standard account, suspend/reactivate it, and reset its password.
6. Verify that anonymous visitors and standard accounts cannot open YouTube pages or call any YouTube API route.
7. Remove the ADMIN_BOOTSTRAP_TOKEN staging secret after the administrator is created. The endpoint is already disabled once an admin exists, but removing the bootstrap secret is good hygiene.
8. Deploy to staging only after the migration and security tests have been explicitly approved. Do not deploy production as part of this work.

## Security notes

- The private path is not a secret once it is included in a public client bundle or shared with a browser. Every admin API request independently checks the server-side session role.
- noindex is a crawler hint, not access control. Robots rules and bot-user-agent redirects must never be treated as protection.
- Admin credentials are never hardcoded in this repository. Passwords are stored only as password hashes.
- The bootstrap route requires the staging-only secret and becomes unavailable after the first admin account exists.
- No account migration or secret change is performed by this code change itself.
