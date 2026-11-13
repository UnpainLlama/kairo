import type { RowConfig } from './tmdb';
import type { PageId } from '../state/slices/uiSlice';

const BASE = 'https://api.themoviedb.org/3';

export const PAGE_CONFIGS: Record<Exclude<PageId, 'myList' | 'search' | 'settings'>, RowConfig[]> = {
  home: [
    { title: 'Trending Now', url: `${BASE}/trending/all/week` },
    { title: 'Popular Movies', url: `${BASE}/movie/popular` },
    { title: 'Top Rated', url: `${BASE}/movie/top_rated` },
    { title: 'Now Playing', url: `${BASE}/movie/now_playing` },
    { title: 'Popular TV Shows', url: `${BASE}/tv/popular` },
    { title: 'Top Rated TV', url: `${BASE}/tv/top_rated` },
    { title: 'Upcoming', url: `${BASE}/movie/upcoming` },
    { title: 'Action Movies', url: `${BASE}/discover/movie?with_genres=28&sort_by=popularity.desc` },
    { title: 'Sci-Fi', url: `${BASE}/discover/movie?with_genres=878&sort_by=popularity.desc` },
    { title: 'Comedies', url: `${BASE}/discover/movie?with_genres=35&sort_by=popularity.desc` },
    { title: 'Thrillers', url: `${BASE}/discover/movie?with_genres=53&sort_by=popularity.desc` },
    { title: 'Documentaries', url: `${BASE}/discover/movie?with_genres=99&sort_by=popularity.desc` },
  ],
  tvShows: [
    { title: 'Trending TV', url: `${BASE}/trending/tv/week` },
    { title: 'Popular TV Shows', url: `${BASE}/tv/popular` },
    { title: 'Top Rated TV', url: `${BASE}/tv/top_rated` },
    { title: 'Airing Today', url: `${BASE}/tv/airing_today` },
    { title: 'Currently On Air', url: `${BASE}/tv/on_the_air` },
    { title: 'Drama', url: `${BASE}/discover/tv?with_genres=18&sort_by=popularity.desc` },
    { title: 'Comedy Shows', url: `${BASE}/discover/tv?with_genres=35&sort_by=popularity.desc` },
    { title: 'Crime', url: `${BASE}/discover/tv?with_genres=80&sort_by=popularity.desc` },
    { title: 'Sci-Fi & Fantasy', url: `${BASE}/discover/tv?with_genres=10765&sort_by=popularity.desc` },
    { title: 'Mystery', url: `${BASE}/discover/tv?with_genres=9648&sort_by=popularity.desc` },
  ],
  movies: [
    { title: 'Trending Movies', url: `${BASE}/trending/movie/week` },
    { title: 'Popular Movies', url: `${BASE}/movie/popular` },
    { title: 'Top Rated Movies', url: `${BASE}/movie/top_rated` },
    { title: 'Now Playing', url: `${BASE}/movie/now_playing` },
    { title: 'Upcoming', url: `${BASE}/movie/upcoming` },
    { title: 'Action', url: `${BASE}/discover/movie?with_genres=28&sort_by=popularity.desc` },
    { title: 'Comedy', url: `${BASE}/discover/movie?with_genres=35&sort_by=popularity.desc` },
    { title: 'Thriller', url: `${BASE}/discover/movie?with_genres=53&sort_by=popularity.desc` },
    { title: 'Horror', url: `${BASE}/discover/movie?with_genres=27&sort_by=popularity.desc` },
    { title: 'Sci-Fi', url: `${BASE}/discover/movie?with_genres=878&sort_by=popularity.desc` },
  ],
  newPopular: [
    { title: 'Trending This Week', url: `${BASE}/trending/all/week` },
    { title: 'Trending Today', url: `${BASE}/trending/all/day` },
    { title: 'Upcoming Movies', url: `${BASE}/movie/upcoming` },
    { title: 'Airing Today', url: `${BASE}/tv/airing_today` },
    { title: 'Currently On Air', url: `${BASE}/tv/on_the_air` },
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
