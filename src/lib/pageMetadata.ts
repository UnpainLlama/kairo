export type SectionMode = 'anime' | 'movies' | 'youtube';

const SHARED_CHROME_PATHS = new Set([
  '/history', '/profile', '/library', '/favorites', '/settings', '/about', '/search', '/login',
]);

export function resolvePageTitle(
  pathname: string,
  lastSectionMode: SectionMode = 'anime',
  adminPath: string | null = null,
): string {
  const isMovieRoute = pathname === '/movies' || pathname.startsWith('/movies/');
  const sharedChromePath = SHARED_CHROME_PATHS.has(pathname);
  const titles: Record<string, string> = {
    '/': 'Discover Anime, Movies and Video',
    '/search': isMovieRoute || (sharedChromePath && lastSectionMode === 'movies') ? 'Search Movies' : 'Search Anime',
    '/history': 'Watch History',
    '/profile': 'Profile',
    '/library': 'My Library',
    '/favorites': 'Favorites',
    '/settings': 'Settings',
    '/about': 'About Kairo',
    '/login': 'Kairo Access',
    '/admin': 'Administrator Console',
    '/movies': 'Movies',
    '/movies/search': 'Search Movies',
    '/movies/library': 'My Movies List',
    '/youtube': 'YouTube Feed',
    '/youtube/search': 'Search YouTube',
    '/youtube/channels': 'YouTube Channels',
    '/youtube/watch-later': 'YouTube Watch Later',
    '/youtube/history': 'YouTube History',
  };
  let title = titles[pathname];
  if (!title && pathname.startsWith('/movies/browse/')) title = 'Browse Movies';
  if (!title && pathname.startsWith('/movies/') && pathname.endsWith('/watch')) title = 'Watch Movie';
  if (!title && pathname.startsWith('/movies/')) title = 'Movie Details';
  if (!title && pathname.startsWith('/youtube/watch/')) title = 'Watch YouTube';
  if (!title && pathname.startsWith('/browse/')) title = 'Browse Anime';
  if (!title && pathname.startsWith('/anime/')) title = 'Anime Details';
  if (!title && pathname.startsWith('/watch/')) title = 'Watch Anime';
  if (!title && adminPath && pathname === adminPath) title = 'Administrator Console';
  return title ?? 'Page Not Found';
}
