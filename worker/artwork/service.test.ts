import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../metadata/cache';
import type { LiveTitle } from '../live/types';
import { enrichArtwork, enrichEpisodeArtwork } from './service';
import type { ArtworkProvider } from './tmdb';

const title: LiveTitle = {
  card: {
    id: 'h8', slug: 'attack-on-titan-8-h8', title: 'Attack on Titan', synopsis: '',
    posterUrl: 'https://hianime.test/poster.jpg', bannerUrl: null, format: 'series', releaseYear: 2013,
    season: 'spring', status: 'finished', rating: null, episodeCount: 25, genres: ['Action'],
  },
  altTitles: ['Shingeki no Kyojin'], malId: null, anilistId: null, url: null, provider: 'hianime',
};

const artwork = {
  tmdbId: 1429, mediaType: 'tv' as const,
  posterUrl: 'https://image.tmdb.org/t/p/w500/tmdb-poster.jpg',
  bannerUrl: 'https://image.tmdb.org/t/p/w1280/tmdb-backdrop.jpg',
};

describe('TMDB artwork enrichment service', () => {
  it('overrides poster and banner without changing catalogue identity or metadata', async () => {
    const provider: ArtworkProvider = { id: 'tmdb', lookup: vi.fn(async () => artwork) };
    const result = await enrichArtwork([title], provider, new MemoryCache());
    expect(result[0]).toMatchObject({
      card: { id: 'h8', slug: title.card.slug, posterUrl: artwork.posterUrl, bannerUrl: artwork.bannerUrl, title: title.card.title, format: 'series' },
      provider: 'hianime', altTitles: title.altTitles,
    });
  });

  it('skips TMDB when AniList already supplied complete card metadata and both images', async () => {
    const complete: LiveTitle = {
      ...title,
      card: {
        ...title.card, synopsis: 'A complete synopsis.',
        posterUrl: 'https://img.test/poster.jpg', bannerUrl: 'https://img.test/banner.jpg',
        rating: 8.5, episodeCount: 25, genres: ['Action'],
      },
    };
    const provider: ArtworkProvider = { id: 'tmdb', lookup: vi.fn(async () => artwork) };
    const result = await enrichArtwork([complete], provider, new MemoryCache());
    expect(result[0]).toEqual(complete);
    expect(provider.lookup).not.toHaveBeenCalled();
  });

  it('fills missing metadata from TMDB even when TMDB has no artwork images', async () => {
    const metadataOnly = {
      tmdbId: 1429, mediaType: 'tv' as const, posterUrl: null, bannerUrl: null,
      overview: 'A scout fights to protect humanity.', rating: 8.6, genres: ['Action', 'Drama'],
      releaseYear: 2013, episodeCount: 87,
    };
    const sparseTitle: LiveTitle = {
      ...title, card: { ...title.card, synopsis: '', rating: null, genres: [], releaseYear: null, episodeCount: null },
    };
    const provider: ArtworkProvider = { id: 'tmdb', lookup: vi.fn(async () => metadataOnly) };
    const result = await enrichArtwork([sparseTitle], provider, new MemoryCache());
    expect(result[0]?.card).toMatchObject({
      synopsis: metadataOnly.overview, rating: 8.6, genres: ['Action', 'Drama'],
      releaseYear: 2013, episodeCount: 87, posterUrl: sparseTitle.card.posterUrl,
    });
    expect(result[0]?.tmdbEnriched).toBe(true);
  });

  it('does not overwrite populated catalogue metadata with different TMDB values', async () => {
    const populatedTitle: LiveTitle = {
      ...title,
      card: {
        ...title.card,
        synopsis: 'Catalogue synopsis.', rating: 7.4, genres: ['Adventure'],
        releaseYear: 2012, episodeCount: 24,
      },
    };
    const metadataOnly = {
      tmdbId: 1429, mediaType: 'tv' as const, posterUrl: null, bannerUrl: null,
      overview: 'TMDB synopsis.', rating: 8.6, genres: ['Action', 'Drama'],
      releaseYear: 2013, episodeCount: 87,
    };
    const provider: ArtworkProvider = { id: 'tmdb', lookup: vi.fn(async () => metadataOnly) };
    const result = await enrichArtwork([populatedTitle], provider, new MemoryCache());
    expect(result[0]?.card).toEqual(populatedTitle.card);
    expect(result[0]?.tmdbEnriched).toBe(false);
  });

  it('caches successful matches and does not repeat TMDB lookup', async () => {
    const cache = new MemoryCache();
    const provider: ArtworkProvider = { id: 'tmdb', lookup: vi.fn(async () => artwork) };
    await enrichArtwork([title], provider, cache);
    await enrichArtwork([title], provider, cache);
    expect(provider.lookup).toHaveBeenCalledTimes(1);
  });

  it('does not break catalogue data when TMDB is down and briefly caches errors', async () => {
    const provider: ArtworkProvider = { id: 'tmdb', lookup: vi.fn(async () => { throw new Error('offline'); }) };
    const cache = new MemoryCache();
    const result = await enrichArtwork([title], provider, cache);
    const retry = await enrichArtwork([title], provider, cache);
    expect(result[0]?.card).toEqual(title.card);
    expect(retry[0]?.card).toEqual(title.card);
    expect(provider.lookup).toHaveBeenCalledTimes(1);
  });

  it('adds per-episode stills and falls back to the series backdrop when a still is missing', async () => {
    const provider: ArtworkProvider = {
      id: 'tmdb',
      lookup: vi.fn(async () => artwork),
      episodeStills: vi.fn(async () => ({ 1: 'https://image.tmdb.org/t/p/w780/episode-1.jpg' })),
    };
    const episodes = [
      { episodeNumber: 1, title: 'Episode One', airedAt: null, synopsis: '', durationSeconds: null },
      { episodeNumber: 2, title: 'Episode Two', airedAt: null, synopsis: '', durationSeconds: null },
    ];
    const result = await enrichEpisodeArtwork(title, episodes, provider, new MemoryCache());
    expect(result.map((episode) => episode.thumbnailUrl)).toEqual([
      'https://image.tmdb.org/t/p/w780/episode-1.jpg',
      artwork.bannerUrl,
    ]);
    expect(provider.episodeStills).toHaveBeenCalledTimes(1);
  });

  it('caches episode stills so repeated episode page requests do not repeat TMDB calls', async () => {
    const cache = new MemoryCache();
    const provider: ArtworkProvider = {
      id: 'tmdb',
      lookup: vi.fn(async () => artwork),
      episodeStills: vi.fn(async () => ({ 1: 'https://image.tmdb.org/t/p/w780/episode-1.jpg' })),
    };
    const episodes = [{ episodeNumber: 1, title: 'Episode One', airedAt: null, synopsis: '', durationSeconds: null }];
    await enrichEpisodeArtwork(title, episodes, provider, cache);
    await enrichEpisodeArtwork(title, episodes, provider, cache);
    expect(provider.lookup).toHaveBeenCalledTimes(1);
    expect(provider.episodeStills).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the TMDB secret is not configured', async () => {
    const result = await enrichArtwork([title], undefined, new MemoryCache());
    expect(result).toEqual([title]);
  });
});
