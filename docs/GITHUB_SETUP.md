# GitHub repository and automated deployment

## 1. Create the repository

1. Sign in to GitHub and create a new empty repository, for example `kairo-anime-platform`.
2. Do not initialize it with a competing README if you already have this starter folder.
3. From the project root, run:

```bash
git init
git add .
git commit -m "Initial KAIRO platform scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/kairo-anime-platform.git
git push -u origin main
```

Replace `YOUR_USERNAME` and repository name with your actual values.

## 2. Create a Cloudflare API token

In Cloudflare Dashboard, open **My Profile → API Tokens** (or the account-level API token area) and create a token with the minimum permissions needed for the workflow. For Worker deployment, use the Cloudflare Workers edit permission template or an equivalent least-privilege custom policy. If the workflow applies D1 migrations, also grant the required D1 edit permission. Restrict the token to the intended account where possible.

Copy the token once and store it securely. Do not put it in a repository file.

Find the Cloudflare Account ID in the account overview/dashboard.

## 3. Add GitHub Actions secrets

In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**.

Create:

- `CLOUDFLARE_API_TOKEN` — the token created above.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID.

Never use a public variable for a secret token. Do not paste secret values into workflow YAML.

## 4. Workflow behavior

`.github/workflows/deploy.yml`:

- Runs on pull requests and pushes to `main`.
- Installs dependencies using `npm ci` when a lockfile exists, otherwise `npm install` for the initial scaffold.
- Runs typecheck, tests, and build when scripts are available.
- Deploys only on a push to `main` after verification succeeds.
- Uses repository secrets for Cloudflare authentication.

Before production use, commit a package lockfile (`npm install` generates `package-lock.json`) and change CI to `npm ci` only. Protect `main` with required pull-request review and required status checks.

## 5. First deployment

After adding secrets and replacing the D1 database ID in `wrangler.jsonc`, push to `main`. The workflow will build and deploy the Worker. Ensure the remote D1 migration has been applied; the workflow is configured to run the migration step before Worker deployment.

If D1 migration permission is intentionally not granted to CI, remove the remote migration step from the workflow and apply migrations manually using a trusted local Wrangler session before release.

## 6. Recommended branch policy

- `main`: production deploy branch.
- Feature branches: pull request build/test only.
- Require tests/build to pass before merging.
- Require review for changes to workflow, Worker config, or migration files.
- Rotate Cloudflare API tokens if a contributor leaves or a token is exposed.

## 7. No Node.js on your machine

You can use GitHub as the toolchain:

1. Upload the project to a new repository (web upload or `git push`). Pushing to `main` runs typecheck, tests and build only; deployment stays off.
2. Open **Actions → Generate package-lock.json → Run workflow** once. It commits a lockfile so later runs use `npm ci`. If `main` is protected, run it on a branch and merge.
3. Work on a branch and open a pull request. The `verify` job reports typecheck, test and build results in the PR. Open a failed step to read the log.
4. For an interactive terminal without installing anything, open the repository in GitHub Codespaces (**Code → Codespaces → Create**).
5. When ready to deploy: create the D1 database in the Cloudflare dashboard (or via `wrangler` in a Codespace), put its ID in `wrangler.jsonc`, add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, then add the repository **variable** `DEPLOY_ENABLED` = `true`.
