import { describe, expect, it } from 'vitest';
import { resolvePageTitle } from './pageMetadata';

describe('route page titles', () => {
  it('provides explicit titles for both stable and rotated administrator paths', () => {
    expect(resolvePageTitle('/admin')).toBe('Administrator Console');
    expect(resolvePageTitle('/pQ4rS8tU1234567890abcdefghijklmnopqrstuvwx_', 'anime', '/pQ4rS8tU1234567890abcdefghijklmnopqrstuvwx_'))
      .toBe('Administrator Console');
  });

  it('keeps shared search metadata aligned with the active media workspace', () => {
    expect(resolvePageTitle('/search', 'anime')).toBe('Search Anime');
    expect(resolvePageTitle('/search', 'movies')).toBe('Search Movies');
    expect(resolvePageTitle('/search', 'youtube')).toBe('Search Anime');
  });

  it('covers YouTube library routes instead of labelling them as missing pages', () => {
    expect(resolvePageTitle('/youtube/watch-later')).toBe('YouTube Watch Later');
    expect(resolvePageTitle('/youtube/history')).toBe('YouTube History');
    expect(resolvePageTitle('/youtube/watch/dQw4w9WgXcQ')).toBe('Watch YouTube');
  });

  it('keeps detail and playback routes distinct and labels unknown routes clearly', () => {
    expect(resolvePageTitle('/movies/123')).toBe('Movie Details');
    expect(resolvePageTitle('/movies/123/watch')).toBe('Watch Movie');
    expect(resolvePageTitle('/anime/one-piece')).toBe('Anime Details');
    expect(resolvePageTitle('/watch/one-piece/4')).toBe('Watch Anime');
    expect(resolvePageTitle('/not-a-route')).toBe('Page Not Found');
  });
});
