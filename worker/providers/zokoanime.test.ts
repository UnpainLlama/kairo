import { describe, expect, it } from 'vitest';
import { buildZokoAnimeEmbedUrl } from './zokoanime';

describe('ZokoAnime iframe adapter', () => {
  it('prefers a mapped MAL id and builds the documented sub route', () => {
    expect(buildZokoAnimeEmbedUrl({ malId: 21, anilistId: 1535, episodeNumber: 4, track: 'sub' }))
      .toBe('https://zokoanime.video/stream/mal/21/4/sub?color=a78bfa');
  });

  it('falls back to an AniList id and supports hardsub and dub tracks', () => {
    expect(buildZokoAnimeEmbedUrl({ anilistId: '1535', episodeNumber: 1, track: 'hsub', color: '#112233' }))
      .toBe('https://zokoanime.video/stream/anilist/1535/1/hsub?color=112233');
    expect(buildZokoAnimeEmbedUrl({ malId: null, anilistId: 1535, episodeNumber: 12, track: 'dub' }))
      .toBe('https://zokoanime.video/stream/anilist/1535/12/dub?color=a78bfa');
  });

  it('rejects missing/invalid ids, episode numbers and colours', () => {
    expect(buildZokoAnimeEmbedUrl({ episodeNumber: 1, track: 'sub' })).toBeNull();
    expect(buildZokoAnimeEmbedUrl({ malId: 0, episodeNumber: 1, track: 'sub' })).toBeNull();
    expect(buildZokoAnimeEmbedUrl({ malId: 21, episodeNumber: 0, track: 'sub' })).toBeNull();
    expect(buildZokoAnimeEmbedUrl({ malId: 21, episodeNumber: 1.5, track: 'sub' })).toBeNull();
    expect(buildZokoAnimeEmbedUrl({ malId: 21, episodeNumber: 1, track: 'sub', color: 'red' })).toBeNull();
  });
});
