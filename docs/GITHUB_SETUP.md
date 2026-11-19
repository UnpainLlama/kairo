# Legacy GitHub setup notes

> **Superseded.** Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the active GitHub Actions workflow, environment secrets/variables, staging deploy gate and production approval.

This historical file contains old single-environment and DEPLOY_ENABLED instructions. Do not create or use that retired variable.

Current workflow: .github/workflows/deploy.yml. Pull requests run Access-config validation, dependency audit, typecheck, tests and build. Pushes to main deploy staging only when STAGING_DEPLOY_ENABLED=true. Production additionally requires PRODUCTION_DEPLOY_APPROVED=true. Migrations run before Worker/assets deployment. Anonymous health probes are skipped by default because Access protects those paths at the edge.

Keep Cloudflare credentials in GitHub Environment secrets, not variables or workflow text.
