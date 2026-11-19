# src/lib/ — folder index

## Purpose

Frontend shared contract, API, state or persistence helper. Preserve typed boundaries with the Worker and guest/account isolation.

## Direct files

- [AccountProvider.tsx](AccountProvider.tsx) — guide: AccountProvider_readme.md.
- [accountStorage.test.ts](accountStorage.test.ts) — guide: accountStorage.test_readme.md.
- [accountStorage.ts](accountStorage.ts) — guide: accountStorage_readme.md.
- [api.ts](api.ts) — guide: api_readme.md.
- [browserPersistence.test.ts](browserPersistence.test.ts) — guide: browserPersistence.test_readme.md.
- [browserPersistence.ts](browserPersistence.ts) — guide: browserPersistence_readme.md.
- [catalog.ts](catalog.ts) — guide: catalog_readme.md.
- [mediaPlayback.test.ts](mediaPlayback.test.ts) — guide: mediaPlayback.test_readme.md.
- [mediaPlayback.ts](mediaPlayback.ts) — guide: mediaPlayback_readme.md.
- [movieLibraryStorage.test.ts](movieLibraryStorage.test.ts) — guide: movieLibraryStorage.test_readme.md.
- [movieLibraryStorage.ts](movieLibraryStorage.ts) — guide: movieLibraryStorage_readme.md.
- [moviePlayback.test.ts](moviePlayback.test.ts) — guide: moviePlayback.test_readme.md.
- [moviePlayback.ts](moviePlayback.ts) — guide: moviePlayback_readme.md.
- [movies.ts](movies.ts) — guide: movies_readme.md.
- [playbackSync.test.ts](playbackSync.test.ts) — guide: playbackSync.test_readme.md.
- [playbackSync.ts](playbackSync.ts) — guide: playbackSync_readme.md.
- [searchState.test.ts](searchState.test.ts) — guide: searchState.test_readme.md.
- [searchState.ts](searchState.ts) — guide: searchState_readme.md.
- [season.test.ts](season.test.ts) — guide: season.test_readme.md.
- [season.ts](season.ts) — guide: season_readme.md.
- [useApi.ts](useApi.ts) — guide: useApi_readme.md.
- [useMyList.tsx](useMyList.tsx) — guide: useMyList_readme.md.
- [youtubeLocalLibrary.test.ts](youtubeLocalLibrary.test.ts) — guide: youtubeLocalLibrary.test_readme.md.
- [youtubeLocalLibrary.ts](youtubeLocalLibrary.ts) — guide: youtubeLocalLibrary_readme.md.
- [youtubeSearchSuggestions.test.ts](youtubeSearchSuggestions.test.ts) — guide: youtubeSearchSuggestions.test_readme.md.
- [youtubeSearchSuggestions.ts](youtubeSearchSuggestions.ts) — guide: youtubeSearchSuggestions_readme.md.

## Child folders


## Connections and maintenance

Frontend pages/components are mounted from src/main.tsx and src/App.tsx and call same-origin Worker APIs. Keep provider credentials and orchestration out of browser code.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.