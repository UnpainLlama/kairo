# Legacy Cloudflare setup notes

> **Superseded.** Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the current environment model, Access setup, D1/KV bindings, Worker secrets, GitHub Actions gates and rollback.

This file is retained as historical Workers/Vite scaffold material. Its old examples mention retired scripts, generic secret names and an earlier single-environment model. Do not copy those commands into the current repository.

Current sources of truth: wrangler.jsonc, package.json, docs/DEPLOYMENT.md, docs/ACCOUNT_ARCHITECTURE.md and docs/REPO_HANDOFF.md. Secrets belong in git-ignored .dev.vars locally or Cloudflare Worker secrets; never commit them or put them in Vite variables.
