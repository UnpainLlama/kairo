import type { YouTubeCardVideo } from '../components/YouTubeVideoCard';

export type RecommendationBucket = 'subscriptions' | 'similar' | 'new' | 'throwback' | 'rewatch' | 'interest';

export type RecommendationWatch = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  updatedAt: number;
  progressSeconds?: number;
  completed?: boolean;
  viewCount?: number;
  firstViewedAt?: number;
  lastViewedAt?: number;
};

export type RecommendationCandidate = { video: YouTubeCardVideo; seedTitle?: string | null };
export type RecommendationTopic = {
  id: string;
  text: string;
  kind: 'interest' | 'block';
  share?: number;
  expiresAt?: number | null;
};
export type RecommendationFeedback = {
  notInterestedVideoIds?: string[];
  blockedChannelIds?: string[];
  dismissedChannelIds?: string[];
};
export type RecommendationImpressions = Record<string, number>;

export type RecommendationTuning = {
  shares: { subscriptions: number; similar: number; new: number; throwback: number; rewatch: number };
  freshness: number;
  channelGap: number;
  newChannelCap: number;
  shuffle: number;
  wornAfter: 0 | 3 | 6 | 12;
  recentDays: 14 | 30 | 60 | 90;
  throwbackYears: 0 | 1 | 3;
  rewatchAfterDays: 30 | 60 | 180 | 365;
  minWatchedPct: number;
  hidePastLive: boolean;
  minMinutes: number;
  maxMinutes: number;
  maxAgeDays: 0 | 7 | 30 | 90 | 365 | 1095;
};

export type RecommendedVideo = YouTubeCardVideo & {
  recommendationBucket: RecommendationBucket;
  recommendationReason: string;
  recommendationScore: number;
};

export const DEFAULT_RECOMMENDATION_TUNING: RecommendationTuning = {
  shares: { subscriptions: 29, similar: 29, new: 24, throwback: 14, rewatch: 4 },
  freshness: 50,
  channelGap: 5,
  newChannelCap: 2,
  shuffle: 50,
  wornAfter: 6,
  recentDays: 30,
  throwbackYears: 3,
  rewatchAfterDays: 60,
  minWatchedPct: 0,
  hidePastLive: false,
  minMinutes: 0,
  maxMinutes: 0,
  maxAgeDays: 0,
};

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
  'but', 'can', 'could', 'did', 'does', 'for', 'from', 'get', 'got', 'had', 'has', 'have',
  'here', 'how', 'into', 'its', 'just', 'like', 'more', 'most', 'new', 'not', 'now', 'off',
  'one', 'our', 'out', 'over', 'same', 'she', 'some', 'such', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'too', 'under', 'use',
  'very', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'will', 'with',
  'you', 'your', 'youtube', 'video', 'videos', 'official', 'episode', 'full', 'part',
]);

function words(value: string): Set<string> {
  return new Set(
    value.toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-z0-9+#]+/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)),
  );
}

function overlap(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection += 1;
  return intersection / Math.max(1, Math.min(left.size, right.size));
}

function channelKey(video: Pick<YouTubeCardVideo, 'channelId' | 'channelTitle'>): string {
  return (video.channelId || video.channelTitle || '').trim().toLowerCase();
}

function topicMatches(text: string, topic: string): boolean {
  const terms = [...words(topic)];
  if (!terms.length) return false;
  const haystack = words(text);
  return terms.every(term => haystack.has(term));
}

function freshness(publishedAt: string | null, now: number, halfLifeDays: number): number {
  if (!publishedAt) return 0;
  const time = Date.parse(publishedAt);
  if (!Number.isFinite(time)) return 0;
  const ageDays = Math.max(0, (now - time) / 86400000);
  return Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
}

function stableNoise(seed: number, value: string): number {
  let hash = (seed ^ 2166136261) >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash << 13;
  hash ^= hash >>> 17;
  hash ^= hash << 5;
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}

function normalizeShares(
  present: RecommendationBucket[],
  tuning: RecommendationTuning,
  interestShare: number,
): Record<RecommendationBucket, number> {
  const base = tuning.shares;
  const regularTotal = Object.values(base).reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
  const interest = Math.min(35, Math.max(0, interestShare));
  const values: Record<RecommendationBucket, number> = {
    subscriptions: Math.max(0, base.subscriptions) / regularTotal * (100 - interest),
    similar: Math.max(0, base.similar) / regularTotal * (100 - interest),
    new: Math.max(0, base.new) / regularTotal * (100 - interest),
    throwback: Math.max(0, base.throwback) / regularTotal * (100 - interest),
    rewatch: Math.max(0, base.rewatch) / regularTotal * (100 - interest),
    interest,
  };
  const sum = present.reduce((total, name) => total + values[name], 0);
  const normalized: Record<RecommendationBucket, number> = {
    subscriptions: 0, similar: 0, new: 0, throwback: 0, rewatch: 0, interest: 0,
  };
  if (sum <= 0) {
    for (const name of present) normalized[name] = 1 / Math.max(1, present.length);
  } else {
    for (const name of present) normalized[name] = values[name] / sum;
  }
  const familiar = (['subscriptions', 'similar'] as RecommendationBucket[]).filter(name =>
    present.includes(name) && normalized[name] > 0,
  );
  if (!familiar.length) return normalized;

  // Empty buckets yield most of their spare share to familiar picks, as in HORDE.
  const caps: Partial<Record<RecommendationBucket, number>> = {
    new: values.new * 1.4 / 100,
    throwback: values.throwback * 1.3 / 100,
    rewatch: values.rewatch * 1.5 / 100,
    interest: values.interest * 1.3 / 100,
  };
  let spare = 0;
  for (const [name, cap] of Object.entries(caps) as Array<[RecommendationBucket, number]>) {
    if (present.includes(name) && normalized[name] > cap) {
      spare += normalized[name] - cap;
      normalized[name] = cap;
    }
  }
  if (spare > 0) {
    const familiarTotal = familiar.reduce((total, name) => total + normalized[name], 0);
    for (const name of familiar) normalized[name] += spare * normalized[name] / familiarTotal;
  }
  return normalized;
}

function candidateAllowed(video: YouTubeCardVideo, tuning: RecommendationTuning, now: number): boolean {
  if (tuning.hidePastLive && (video as YouTubeCardVideo & { liveStatus?: string }).liveStatus === 'post_live') return false;
  const duration = video.durationSeconds ?? 0;
  if (duration > 0 && tuning.minMinutes > 0 && duration < tuning.minMinutes * 60) return false;
  if (duration > 0 && tuning.maxMinutes > 0 && duration > tuning.maxMinutes * 60) return false;
  if (tuning.maxAgeDays > 0) {
    const published = video.publishedAt ? Date.parse(video.publishedAt) : NaN;
    if (!Number.isFinite(published) || now - published > tuning.maxAgeDays * 86400000) return false;
  }
  return true;
}

export function buildRecommendationFeed(input: {
  history: RecommendationWatch[];
  candidates: RecommendationCandidate[];
  topics?: RecommendationTopic[];
  feedback?: RecommendationFeedback;
  impressions?: RecommendationImpressions;
  tuning?: RecommendationTuning;
  now?: number;
  seed?: number;
  limit?: number;
}): RecommendedVideo[] {
  const now = input.now ?? Date.now();
  const tuning = input.tuning ?? DEFAULT_RECOMMENDATION_TUNING;
  const history = [...input.history].sort((a, b) => b.updatedAt - a.updatedAt);
  const recentLine = now - tuning.recentDays * 86400000;
  const throwbackLine = tuning.throwbackYears === 0
    ? now - 50 * 365 * 86400000
    : now - tuning.throwbackYears * 365 * 86400000;
  const recentHistory = history.filter(watch => watch.updatedAt >= recentLine);
  const olderHistory = history.filter(watch => watch.updatedAt < recentLine && watch.updatedAt >= throwbackLine);
  const recentChannels = new Map<string, number>();
  const oldChannels = new Map<string, number>();
  const allChannels = new Map<string, number>();
  for (const watch of history) {
    const key = (watch.channelId || watch.channelTitle).trim().toLowerCase();
    if (!key) continue;
    allChannels.set(key, (allChannels.get(key) ?? 0) + 1);
    if (watch.updatedAt >= recentLine) recentChannels.set(key, (recentChannels.get(key) ?? 0) + 1);
    else oldChannels.set(key, (oldChannels.get(key) ?? 0) + 1);
  }

  const topics = (input.topics ?? []).filter(topic =>
    topic.text.trim().length > 0 && (!topic.expiresAt || topic.expiresAt > now),
  );
  const interests = topics.filter(topic => topic.kind === 'interest');
  const blocks = topics.filter(topic => topic.kind === 'block');
  const interestShare = Math.min(35, interests.reduce((sum, topic) => sum + Math.max(0, topic.share ?? 0), 0));
  const feedback = input.feedback ?? {};
  const notInterested = new Set(feedback.notInterestedVideoIds ?? []);
  const blockedChannels = new Set([
    ...(feedback.blockedChannelIds ?? []),
    ...(feedback.dismissedChannelIds ?? []),
  ].map(value => value.toLowerCase()));
  const watched = new Map(history.map(item => [item.videoId, item]));
  const items = new Map<string, { bucket: RecommendationBucket; score: number; reason: string; video: YouTubeCardVideo }>();
  const halfLife = Math.pow(2, (50 - tuning.freshness) / 25) * 60;

  const add = (video: YouTubeCardVideo, bucket: RecommendationBucket, score: number, reason: string) => {
    if (items.has(video.videoId)) return;
    items.set(video.videoId, { bucket, score, reason, video });
  };

  // The rewatch bucket is drawn from old watches, never from fresh search results.
  for (const watch of history) {
    const ageDays = Math.max(0, (now - watch.updatedAt) / 86400000);
    const repeat = watch.viewCount ?? 1;
    if (ageDays < tuning.rewatchAfterDays || (!watch.completed && repeat < 2)) continue;
    if (notInterested.has(watch.videoId)) continue;
    const channel = (watch.channelId || watch.channelTitle).trim().toLowerCase();
    if (blockedChannels.has(channel)) continue;
    if (blocks.some(topic => topicMatches(watch.title + ' ' + watch.description + ' ' + watch.channelTitle, topic.text))) continue;
    const recentFit = recentHistory.reduce((best, item) =>
      Math.max(best, overlap(watch.title + ' ' + watch.description, item.title + ' ' + item.description)), 0);
    const channelFit = Math.min(1, (allChannels.get(channel) ?? 0) / 4);
    const score = 0.45 * recentFit + 0.25 * channelFit + 0.15 * (repeat > 1 ? 1 : 0) + 0.15 * Math.min(1, ageDays / 365);
    add({
      videoId: watch.videoId,
      title: watch.title,
      description: watch.description,
      thumbnailUrl: watch.thumbnailUrl,
      channelId: watch.channelId || undefined,
      channelTitle: watch.channelTitle,
      publishedAt: watch.publishedAt,
      durationSeconds: watch.durationSeconds,
    }, 'rewatch', score, 'You watched this ' + Math.floor(ageDays / 30) + ' months ago');
  }

  for (const candidate of input.candidates) {
    const video = candidate.video;
    if (!video.videoId || watched.has(video.videoId)) continue;
    if (notInterested.has(video.videoId) || !candidateAllowed(video, tuning, now)) continue;
    const channel = channelKey(video);
    if (!channel || blockedChannels.has(channel)) continue;
    const text = video.title + ' ' + (video.description ?? '') + ' ' + video.channelTitle;
    if (blocks.some(topic => topicMatches(text, topic.text))) continue;

    const knownCount = allChannels.get(channel) ?? 0;
    const recentCount = recentChannels.get(channel) ?? 0;
    const oldCount = oldChannels.get(channel) ?? 0;
    const recentFit = Math.max(
      0,
      ...recentHistory.map(watch => overlap(text, watch.title + ' ' + watch.description + ' ' + (candidate.seedTitle ?? ''))),
      candidate.seedTitle ? overlap(text, candidate.seedTitle) : 0,
    );
    const olderFit = Math.max(
      0,
      ...olderHistory.map(watch => overlap(text, watch.title + ' ' + watch.description)),
    );
    const fresh = freshness(video.publishedAt, now, halfLife);
    const channelFit = Math.min(1, knownCount / 4);
    const interest = interests.find(topic => topicMatches(text, topic.text));

    if (interest) {
      add(video, 'interest', 0.6 + 0.2 * recentFit + 0.1 * fresh, 'For your interest: ' + interest.text);
      continue;
    }

    const published = video.publishedAt ? Date.parse(video.publishedAt) : NaN;
    const recentlyUploaded = Number.isFinite(published) && now - published <= 21 * 86400000;
    if (recentCount > 0 && recentlyUploaded) {
      add(video, 'subscriptions', 0.55 * fresh + 0.25 * Math.min(1, recentCount / 3) + 0.2 * recentFit,
        'New from ' + video.channelTitle + ', which you watch');
      continue;
    }

    if (oldCount > 0 && recentCount === 0) {
      const score = 0.45 * (oldCount / Math.max(1, allChannels.get(channel) ?? 1)) + 0.35 * olderFit + 0.2 * fresh;
      add(video, 'throwback', score, 'You used to watch ' + video.channelTitle);
      continue;
    }

    if (knownCount === 0) {
      const score = recentFit + 0.05 * fresh;
      if (score >= 0.3) {
        const reason = candidate.seedTitle
          ? 'New channel for you · Because you watched ' + candidate.seedTitle.slice(0, 48)
          : 'New channel for you';
        add(video, 'new', score, reason);
      }
      continue;
    }

    const score = recentFit + 0.08 * channelFit + 0.04 * fresh;
    if (score >= 0.15) {
      const reason = candidate.seedTitle
        ? 'Because you watched ' + candidate.seedTitle.slice(0, 55)
        : 'More from ' + video.channelTitle;
      add(video, 'similar', score, reason);
    }
  }

  const queues = new Map<RecommendationBucket, RecommendedVideo[]>();
  const bucketNames: RecommendationBucket[] = ['subscriptions', 'similar', 'new', 'throwback', 'rewatch', 'interest'];
  for (const bucket of bucketNames) {
    const queue = [...items.values()]
      .filter(item => item.bucket === bucket)
      .map(item => ({
        ...item.video,
        recommendationBucket: bucket,
        recommendationReason: item.reason,
        recommendationScore: item.score + stableNoise(input.seed ?? 1, item.video.videoId)
          * (bucket === 'new' ? 0.06 : 0.02) * tuning.shuffle / 50,
      }))
      .sort((a, b) => b.recommendationScore - a.recommendationScore);
    if (queue.length) queues.set(bucket, queue);
  }

  const caps: Partial<Record<RecommendationBucket, number>> = {
    new: tuning.newChannelCap,
    throwback: 3,
    rewatch: 2,
    interest: 3,
  };
  const channelCounts = new Map<string, Partial<Record<RecommendationBucket, number>>>();
  const lastChannels: string[] = [];
  const out: RecommendedVideo[] = [];
  const worn: RecommendedVideo[] = [];
  const credit = new Map<RecommendationBucket, number>();
  const impressions = input.impressions ?? {};
  const limit = Math.min(200, Math.max(1, input.limit ?? 60));
  for (const bucket of queues.keys()) credit.set(bucket, 0);

  const canUse = (video: RecommendedVideo, strictSpacing: boolean): boolean => {
    const channel = channelKey(video);
    const cap = caps[video.recommendationBucket];
    const count = channelCounts.get(channel)?.[video.recommendationBucket] ?? 0;
    if (cap !== undefined && count >= cap) return false;
    if (strictSpacing && tuning.channelGap > 1 && lastChannels.slice(-(tuning.channelGap - 1)).includes(channel)) return false;
    if (video.recommendationBucket === 'throwback' && out.length < 12 && queues.size > 1) return false;
    return true;
  };

  const take = (bucket: RecommendationBucket, strictSpacing: boolean): RecommendedVideo | null => {
    const queue = queues.get(bucket);
    if (!queue?.length) return null;
    const index = queue.findIndex(video => canUse(video, strictSpacing));
    if (index < 0) return null;
    const [video] = queue.splice(index, 1);
    if (tuning.wornAfter > 0 && (impressions[video.videoId] ?? 0) >= tuning.wornAfter) {
      worn.push(video);
      return null;
    }
    const channel = channelKey(video);
    const counts = channelCounts.get(channel) ?? {};
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    channelCounts.set(channel, counts);
    lastChannels.push(channel);
    out.push(video);
    return video;
  };

  let guard = 0;
  while (out.length < limit && guard < limit * 20) {
    guard += 1;
    const present = [...queues.entries()]
      .filter(([, queue]) => queue.length > 0)
      .map(([bucket]) => bucket);
    if (!present.length) break;
    const shares = normalizeShares(present, tuning, interestShare);
    for (const bucket of present) credit.set(bucket, (credit.get(bucket) ?? 0) + shares[bucket]);
    const order = [...present].sort((a, b) => (credit.get(b) ?? 0) - (credit.get(a) ?? 0));
    let placed = false;
    for (const bucket of order) {
      if (take(bucket, true)) {
        credit.set(bucket, (credit.get(bucket) ?? 0) - 1);
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (const bucket of order) {
        if (take(bucket, false)) {
          credit.set(bucket, (credit.get(bucket) ?? 0) - 1);
          placed = true;
          break;
        }
      }
    }
    if (!placed) break;
  }

  for (const bucket of queues.keys()) {
    const queue = queues.get(bucket) ?? [];
    for (const video of queue) {
      if (out.length + worn.length >= limit) break;
      if (!worn.includes(video)) worn.push(video);
    }
  }
  return [...out, ...worn].slice(0, limit);
}
