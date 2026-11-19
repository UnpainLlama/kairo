# worker/metadata/providers/ — folder index

## Purpose

Provider-neutral Anime metadata normalization/cache/match/merge/enrichment or legacy D1 metadata implementation.

## Direct files

- [anilist.ts](anilist.ts) — guide: anilist_readme.md.
- [http.ts](http.ts) — guide: http_readme.md.
- [kitsu.ts](kitsu.ts) — guide: kitsu_readme.md.
- [manami.ts](manami.ts) — guide: manami_readme.md.

## Child folders


## Connections and maintenance

Backend modules are composed from worker/index.ts or their parent domain service. Enforce Access identity, roles and data ownership on the server.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.