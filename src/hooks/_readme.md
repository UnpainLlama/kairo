# src/hooks/ — folder index

## Purpose

Reusable React hook that adapts shared account/app state for feature consumers.

## Direct files

- [useAccountScope.ts](useAccountScope.ts) — guide: useAccountScope_readme.md.

## Child folders


## Connections and maintenance

Frontend pages/components are mounted from src/main.tsx and src/App.tsx and call same-origin Worker APIs. Keep provider credentials and orchestration out of browser code.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.