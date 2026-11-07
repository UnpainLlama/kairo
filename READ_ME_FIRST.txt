KAIRO staging branch: everything since the current main (commit 7cc66ed) in ONE set. Ignore any earlier zips from this chat.

1. GitHub > branch dropdown > type "staging-infra" > Create branch from main.
2. On that branch: Add file > Upload files. Drag in the folders/files from this zip (docs, migrations, src, worker, README.md, package.json, tsconfig.node.json, tsconfig.worker.json, vitest.config.ts, wrangler.jsonc). Commit to staging-infra.
3. The two workflow files are in .github/workflows (a hidden folder, which the web uploader may skip). Open each on GitHub > pencil (edit) > select all > paste the file from PASTE_MANUALLY/ > commit to staging-infra:
     .github/workflows/deploy.yml          <- PASTE_MANUALLY/deploy.yml
     .github/workflows/generate-lockfile.yml <- PASTE_MANUALLY/generate-lockfile.yml
4. Actions tab > "Generate package-lock.json" > Run workflow > branch staging-infra.
5. Open a pull request staging-infra -> main. Wait for the checks to go green. Do not merge yet if they fail; send me the error.
6. Then follow docs/DEPLOYMENT.md section 2 (Cloudflare IDs, token, GitHub environment).
