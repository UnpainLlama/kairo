# worker/providers/ — folder index

## Purpose

Playback/embed boundary helper; validate URLs fail-closed and never trust a client-supplied media URL.

## Direct files

- [playback.test.ts](playback.test.ts) — guide: playback.test_readme.md.
- [playback.ts](playback.ts) — guide: playback_readme.md.
- [zokoanime.test.ts](zokoanime.test.ts) — guide: zokoanime.test_readme.md.
- [zokoanime.ts](zokoanime.ts) — guide: zokoanime_readme.md.

## Child folders


## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.