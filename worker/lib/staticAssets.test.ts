import { describe, expect, it } from 'vitest';
import { isStaticAssetPath } from './staticAssets';

describe('static asset path classification', () => {
  it.each([
    '/assets/index-abc123.js',
    '/favicon.svg',
    '/site.webmanifest',
    '/artwork/poster.webp',
    '/font/app.woff2',
  ])('classifies %s as a static asset request', (path) => {
    expect(isStaticAssetPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/anime/one-piece',
    '/movies/123',
    '/admin',
    '/api/v1/me',
    '/index.html',
  ])('does not classify %s as a static asset request', (path) => {
    expect(isStaticAssetPath(path)).toBe(false);
  });
});
