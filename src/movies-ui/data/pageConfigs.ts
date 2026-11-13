import type { RowConfig } from './tmdb';
import type { PageId } from '../state/slices/uiSlice';

export const PAGE_CONFIGS: Record<Exclude<PageId, 'myList' | 'search' | 'settings'>, RowConfig[]> = {
  home: [
    { title: 'Trending Now', kind: 'trending', mediaType: 'all', window: 'week' },
    { title: 'Popular Movies', kind: 'popular', mediaType: 'movie' },
    { title: 'Top Rated Movies', kind: 'top_rated', mediaType: 'movie' },
    { title: 'Now Playing', kind: 'now_playing', mediaType: 'movie' },
    { title: 'Popular TV Shows', kind: 'popular', mediaType: 'tv' },
    { title: 'Top Rated TV', kind: 'top_rated', mediaType: 'tv' },
    { title: 'Upcoming Movies', kind: 'upcoming', mediaType: 'movie' },
    { title: 'Action Movies', kind: 'discover', mediaType: 'movie', genreId: 28 },
    { title: 'Sci-Fi Movies', kind: 'discover', mediaType: 'movie', genreId: 878 },
    { title: 'Comedies', kind: 'discover', mediaType: 'movie', genreId: 35 },
    { title: 'Thrillers', kind: 'discover', mediaType: 'movie', genreId: 53 },
    { title: 'Documentaries', kind: 'discover', mediaType: 'movie', genreId: 99 },
  ],
  tvShows: [
    { title: 'Trending TV', kind: 'trending', mediaType: 'tv', window: 'week' },
    { title: 'Popular TV Shows', kind: 'popular', mediaType: 'tv' },
    { title: 'Top Rated TV', kind: 'top_rated', mediaType: 'tv' },
    { title: 'Airing Today', kind: 'airing_today', mediaType: 'tv' },
    { title: 'Currently On Air', kind: 'on_the_air', mediaType: 'tv' },
    { title: 'Drama', kind: 'discover', mediaType: 'tv', genreId: 18 },
    { title: 'Comedy Shows', kind: 'discover', mediaType: 'tv', genreId: 35 },
    { title: 'Crime', kind: 'discover', mediaType: 'tv', genreId: 80 },
    { title: 'Sci-Fi & Fantasy', kind: 'discover', mediaType: 'tv', genreId: 10765 },
    { title: 'Mystery', kind: 'discover', mediaType: 'tv', genreId: 9648 },
  ],
  movies: [
    { title: 'Trending Movies', kind: 'trending', mediaType: 'movie', window: 'week' },
    { title: 'Popular Movies', kind: 'popular', mediaType: 'movie' },
    { title: 'Top Rated Movies', kind: 'top_rated', mediaType: 'movie' },
    { title: 'Now Playing', kind: 'now_playing', mediaType: 'movie' },
    { title: 'Upcoming', kind: 'upcoming', mediaType: 'movie' },
    { title: 'Action', kind: 'discover', mediaType: 'movie', genreId: 28 },
    { title: 'Comedy', kind: 'discover', mediaType: 'movie', genreId: 35 },
    { title: 'Thriller', kind: 'discover', mediaType: 'movie', genreId: 53 },
    { title: 'Horror', kind: 'discover', mediaType: 'movie', genreId: 27 },
    { title: 'Sci-Fi', kind: 'discover', mediaType: 'movie', genreId: 878 },
  ],
  newPopular: [
    { title: 'Trending This Week', kind: 'trending', mediaType: 'all', window: 'week' },
    { title: 'Trending Today', kind: 'trending', mediaType: 'all', window: 'day' },
    { title: 'Upcoming Movies', kind: 'upcoming', mediaType: 'movie' },
    { title: 'Airing Today', kind: 'airing_today', mediaType: 'tv' },
    { title: 'Currently On Air', kind: 'on_the_air', mediaType: 'tv' },
  ],
};

export const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'tvShows', label: 'TV Shows' },
  { id: 'movies', label: 'Movies' },
  { id: 'newPopular', label: 'New & Popular' },
  { id: 'myList', label: 'My List' },
  { id: 'search', label: 'Search' },
];
