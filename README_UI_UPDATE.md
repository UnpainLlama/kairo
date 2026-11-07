# Kairo UI redesign update

This archive is a frontend-only overlay for the Kairo repository.

## Apply

Extract the archive into the root of your existing Kairo GitHub repository and allow the `src/` files to merge/overwrite at their matching paths. Commit and deploy to **staging first**.

## What's included

- `src/App.tsx`: Miruro-inspired fixed icon rail, hover labels, centered top search, profile control, and mobile bottom navigation.
- `src/pages/HomePage.tsx`: artwork-led hero, featured carousel controls, latest/trending rails, and Top Airing sidebar.
- `src/pages/AnimePage.tsx`: backdrop-led anime details and clickable episode cards.
- `src/pages/WatchPage.tsx`: new watch layout with a large player state and scrollable episode queue.
- `src/lib/catalog.ts`: frontend type for episode server labels.
- `src/styles.css`: responsive shell, home, detail, search, episode and watch-page styling.

## Important playback limitation

The watch page is a UI shell. Kairo currently retrieves episode metadata and sub/dub/raw server labels only. It does not retrieve or embed stream URLs, and the player displays that limitation transparently. No playback extraction or media proxy code is included.

## Verification

TS/TSX syntax transpilation and CSS brace/whitespace checks passed. A full `npm run build` and Vitest run were not completed because dependency installation timed out in this environment. No GitHub push or Cloudflare deployment was performed.
