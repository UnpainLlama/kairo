import { describe, expect, it } from 'vitest';
import { isYouTubeVideoId, isYouTubeVideoMarkedMadeForKids, parseYouTubeDuration, safeYouTubeThumbnailUrl } from './routes';

describe('YouTube media input validation', () => {
  it('accepts canonical 11-character video IDs only', () => {
    expect(isYouTubeVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeVideoId('short')).toBe(false);
    expect(isYouTubeVideoId('dQw4w9WgXcQ?x=1')).toBe(false);
    expect(isYouTubeVideoId('dQw4w9WgXc!')).toBe(false);
  });

  it('parses ISO 8601 video durations safely', () => {
    expect(parseYouTubeDuration('PT4M13S')).toBe(253);
    expect(parseYouTubeDuration('PT1H2M3S')).toBe(3723);
    expect(parseYouTubeDuration('P1DT2H')).toBe(93600);
    expect(parseYouTubeDuration('not-a-duration')).toBe(null);
    expect(parseYouTubeDuration('P99DT')).toBe(null);
  });

  it('accepts only HTTPS YouTube thumbnail hosts', () => {
    expect(safeYouTubeThumbnailUrl('https://i.ytimg.com/vi/demo/hqdefault.jpg')).toBe('https://i.ytimg.com/vi/demo/hqdefault.jpg');
    expect(safeYouTubeThumbnailUrl('https://yt3.ggpht.com/channel/avatar')).toBe('https://yt3.ggpht.com/channel/avatar');
    expect(safeYouTubeThumbnailUrl('http://i.ytimg.com/image.jpg')).toBe(null);
    expect(safeYouTubeThumbnailUrl('https://example.com/image.jpg')).toBe(null);
  });
});

describe('YouTube Made for Kids status', () => {
  it('detects the API-provided Made for Kids flag without guessing when absent', () => {
    expect(isYouTubeVideoMarkedMadeForKids({ madeForKids: true })).toBe(true);
    expect(isYouTubeVideoMarkedMadeForKids({ madeForKids: false })).toBe(false);
    expect(isYouTubeVideoMarkedMadeForKids({})).toBe(false);
    expect(isYouTubeVideoMarkedMadeForKids(null)).toBe(false);
  });
});
