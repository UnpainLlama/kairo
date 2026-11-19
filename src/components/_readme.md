# src/components/ — folder index

## Purpose

Reusable React UI component. Keep domain data loading and server-side provider orchestration outside presentation components.

## Direct files

- [AnimeEmbedPlayer.tsx](AnimeEmbedPlayer.tsx) — guide: AnimeEmbedPlayer_readme.md.
- [KairoMediaPlayer.tsx](KairoMediaPlayer.tsx) — guide: KairoMediaPlayer_readme.md.
- [KairoVideoJsPlayer.tsx](KairoVideoJsPlayer.tsx) — guide: KairoVideoJsPlayer_readme.md.
- [MovieCard.tsx](MovieCard.tsx) — guide: MovieCard_readme.md.
- [MovieEmbedPlayer.tsx](MovieEmbedPlayer.tsx) — guide: MovieEmbedPlayer_readme.md.
- [SearchBar.tsx](SearchBar.tsx) — guide: SearchBar_readme.md.
- [Select.tsx](Select.tsx) — guide: Select_readme.md.
- [TitleDetail.tsx](TitleDetail.tsx) — guide: TitleDetail_readme.md.
- [YouTubeIframePlayer.tsx](YouTubeIframePlayer.tsx) — guide: YouTubeIframePlayer_readme.md.
- [YouTubeVideoCard.tsx](YouTubeVideoCard.tsx) — guide: YouTubeVideoCard_readme.md.
- [catalog.tsx](catalog.tsx) — guide: catalog_readme.md.

## Child folders


## Connections and maintenance

Frontend pages/components are mounted from src/main.tsx and src/App.tsx and call same-origin Worker APIs. Keep provider credentials and orchestration out of browser code.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.