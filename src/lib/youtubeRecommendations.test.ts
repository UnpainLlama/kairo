import { describe, expect, it } from 'vitest';
import { buildRecommendationFeed, DEFAULT_RECOMMENDATION_TUNING, type RecommendationWatch } from './youtubeRecommendations';
import type { YouTubeCardVideo } from '../components/YouTubeVideoCard';

const now = Date.parse('2026-11-28T09:00:00.000Z');

function watch(overrides: Partial<RecommendationWatch> = {}): RecommendationWatch {
  return {
    videoId: 'watched0011',
    title: 'How to build an Arduino robot',
    description: 'A practical robotics project using Arduino sensors',
    thumbnailUrl: null,
    channelId: 'UC_WATCHED_123',
    channelTitle: 'Robot Workshop',
    publishedAt: '2026-11-01T00:00:00.000Z',
    durationSeconds: 600,
    updatedAt: now - 86400000,
    viewCount: 1,
    completed: false,
    ...overrides,
  };
}

function candidate(videoId: string, channelId: string, channelTitle: string, overrides: Partial<YouTubeCardVideo> = {}) {
  const video: YouTubeCardVideo = {
    videoId,
    title: 'Arduino robot build with new sensors',
    description: 'A robotics guide for an Arduino project',
    thumbnailUrl: null,
    channelId,
    channelTitle,
    publishedAt: '2026-11-27T00:00:00.000Z',
    durationSeconds: 600,
    ...overrides,
  };
  return { video, seedTitle: 'How to build an Arduino robot' };
}

describe('HORDE-style YouTube recommendation ranking', () => {
  it('starts discovering related creators without waiting for five different channels', () => {
    const feed = buildRecommendationFeed({
      history: [watch()],
      candidates: [candidate('newvideo001', 'UC_NEW_12345', 'Robotics Lab')],
      now,
      seed: 1,
    });

    expect(feed).toHaveLength(1);
    expect(feed[0].recommendationBucket).toBe('new');
    expect(feed[0].recommendationReason).toContain('New channel for you');
  });

  it('recognizes recent uploads from a channel the viewer watches', () => {
    const feed = buildRecommendationFeed({
      history: [watch(), watch({ videoId: 'watched0022', updatedAt: now - 3600000 })],
      candidates: [{
        video: {
          videoId: 'freshupload1',
          title: 'New robotics workshop build',
          description: 'Arduino sensor guide',
          thumbnailUrl: null,
          channelId: 'UC_WATCHED_123',
          channelTitle: 'Robot Workshop',
          publishedAt: '2026-11-27T00:00:00.000Z',
          durationSeconds: 420,
        },
        seedTitle: 'How to build an Arduino robot',
      }],
      now,
      seed: 2,
    });

    expect(feed[0].recommendationBucket).toBe('subscriptions');
    expect(feed[0].recommendationReason).toContain('Robot Workshop');
  });

  it('offers old repeat watches in the rewatch bucket', () => {
    const oldWatch = watch({
      videoId: 'oldwatch001',
      updatedAt: now - 100 * 86400000,
      viewCount: 3,
      completed: true,
    });
    const feed = buildRecommendationFeed({ history: [oldWatch], candidates: [], now, seed: 3 });

    expect(feed[0]).toMatchObject({
      videoId: 'oldwatch001',
      recommendationBucket: 'rewatch',
    });
  });

  it('honors video and channel exclusions', () => {
    const feed = buildRecommendationFeed({
      history: [watch()],
      candidates: [
        candidate('blockedvideo1', 'UC_NEW_12345', 'Robotics Lab'),
        candidate('blockedvideo2', 'UC_OTHER_12345', 'Other Robotics'),
      ],
      feedback: {
        notInterestedVideoIds: ['blockedvideo1'],
        blockedChannelIds: ['UC_OTHER_12345'],
      },
      now,
    });

    expect(feed).toEqual([]);
  });

  it('uses the Balanced five-bucket shares and a five-slot channel gap by default', () => {
    expect(DEFAULT_RECOMMENDATION_TUNING.shares).toEqual({
      subscriptions: 29,
      similar: 29,
      new: 24,
      throwback: 14,
      rewatch: 4,
    });
    expect(DEFAULT_RECOMMENDATION_TUNING.channelGap).toBe(5);
    expect(DEFAULT_RECOMMENDATION_TUNING.newChannelCap).toBe(2);
  });
});
