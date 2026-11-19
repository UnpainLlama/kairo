# src/pages/ — folder index

## Purpose

Route-level React screen. Composes shared components/hooks and calls the same-origin Kairo Worker API.

## Direct files

- [AdminPage.tsx](AdminPage.tsx) — guide: AdminPage_readme.md.
- [AnimePage.tsx](AnimePage.tsx) — guide: AnimePage_readme.md.
- [AuthPage.tsx](AuthPage.tsx) — guide: AuthPage_readme.md.
- [BrowsePage.tsx](BrowsePage.tsx) — guide: BrowsePage_readme.md.
- [DiscoverPage.tsx](DiscoverPage.tsx) — guide: DiscoverPage_readme.md.
- [HomePage.tsx](HomePage.tsx) — guide: HomePage_readme.md.
- [MoviesBrowsePage.tsx](MoviesBrowsePage.tsx) — guide: MoviesBrowsePage_readme.md.
- [MoviesDetailPage.tsx](MoviesDetailPage.tsx) — guide: MoviesDetailPage_readme.md.
- [MoviesHomePage.tsx](MoviesHomePage.tsx) — guide: MoviesHomePage_readme.md.
- [MoviesLibraryPage.tsx](MoviesLibraryPage.tsx) — guide: MoviesLibraryPage_readme.md.
- [MoviesSearchPage.tsx](MoviesSearchPage.tsx) — guide: MoviesSearchPage_readme.md.
- [MoviesWatchPage.tsx](MoviesWatchPage.tsx) — guide: MoviesWatchPage_readme.md.
- [SearchPage.tsx](SearchPage.tsx) — guide: SearchPage_readme.md.
- [SeasonalPage.tsx](SeasonalPage.tsx) — guide: SeasonalPage_readme.md.
- [StaticPages.tsx](StaticPages.tsx) — guide: StaticPages_readme.md.
- [TrendingPage.tsx](TrendingPage.tsx) — guide: TrendingPage_readme.md.
- [WatchPage.tsx](WatchPage.tsx) — guide: WatchPage_readme.md.
- [YouTubeChannelsPage.tsx](YouTubeChannelsPage.tsx) — guide: YouTubeChannelsPage_readme.md.
- [YouTubeFeedPage.tsx](YouTubeFeedPage.tsx) — guide: YouTubeFeedPage_readme.md.
- [YouTubeLibraryPages.tsx](YouTubeLibraryPages.tsx) — guide: YouTubeLibraryPages_readme.md.
- [YouTubeSearchPage.tsx](YouTubeSearchPage.tsx) — guide: YouTubeSearchPage_readme.md.
- [YouTubeWatchPage.tsx](YouTubeWatchPage.tsx) — guide: YouTubeWatchPage_readme.md.

## Child folders


## Connections and maintenance

Frontend pages/components are mounted from src/main.tsx and src/App.tsx and call same-origin Worker APIs. Keep provider credentials and orchestration out of browser code.

Every tracked file in this folder has an adjacent <filename>_readme.md guide.