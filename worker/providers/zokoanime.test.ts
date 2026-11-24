import { describe, expect, it } from 'vitest';
import { buildZokoAnimeEmbedUrl } from './zokoanime';

describe('ZokoAnime iframe adapter', () => {
  it('prefers a mapped MAL id and builds the documented sub route', () => {
    expect(buildZokoAnimeEmbedUrl({ malId: 21, episodeNumber: 4, track: 'sub' }))
      .toBe('https://zokoanime.video/stream/mal/21/4/sub?color=a78bfa');
  });

  it('supports hard-sub and dub tracks using MAL identifiers only', () => {
    expect(buildZokoAnimeEmbedUrl({ malId: '1535', episodeNumber: 1, track: 'hsub', color: '#112233' }))
      .toBe('https://zokoanime.video/stream/mal/1535/1/hsub?color=112233');
    expect(buildZokoAnimeEmbedUrl({ malId: 21, episodeNumber: 12, track: 'dub' }))
      .toBe('https://zokoanime.video/stream/mal/21/12/dub?color=a78bfa');
  });

  it('rejects missing/invalid MAL ids, episode numbers and colours', () => {
    expect(buildZokoAnimeEmbedUrl({ episodeNumber: 1, track: 'sub' })).toBeNull();
    expect(buildZokoAnimeEmbedUrl({ malId: 0, episodeNumber: 1, track: 'sub' })).toBeNull();
    expect(buildZokoAnimeEmbedUrl({ malId: 21, episodeNumber: 0, track: 'sub' })).toBeNull();
    expect(buildZokoAnimeEmbedUrl({ malId: 21, episodeNumber: 1.5, track: 'sub' })).toBeNull();
    expect(buildZokoAnimeEmbedUrl({ malId: 21, episodeNumber: 1, track: 'sub', color: 'red' })).toBeNull();
  });
});
