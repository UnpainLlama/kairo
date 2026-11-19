# worker/movies/providers/ — folder index

## Purpose

Independent Movies domain module using Movie contracts and TMDB, separate from Anime.

## Direct files

- [tmdb.test.ts](tmdb.test.ts) — guide: tmdb.test_readme.md.
- [tmdb.ts](tmdb.ts) — guide: tmdb_readme.md.

## Child folders


## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.