-- Kairo recommendation history, feedback, tuning, and gathered candidates.
-- Watch-page opens remain weak interest signals; the embedded player is not inspected.
ALTER TABLE youtube_watch_history ADD COLUMN view_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE youtube_watch_history ADD COLUMN first_viewed_at INTEGER;
ALTER TABLE youtube_watch_history ADD COLUMN last_viewed_at INTEGER;
UPDATE youtube_watch_history
SET first_viewed_at = COALESCE(first_viewed_at, updated_at),
    last_viewed_at = COALESCE(last_viewed_at, updated_at);

CREATE TABLE IF NOT EXISTS youtube_recommendation_candidates (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL CHECK (length(video_id) = 11),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  channel_id TEXT,
  channel_title TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  duration_seconds INTEGER,
  source TEXT NOT NULL CHECK (source IN ('search', 'channel_uploads')),
  seed_video_id TEXT,
  seed_title TEXT,
  seed_channel_id TEXT,
  seed_channel_title TEXT,
  source_rank INTEGER NOT NULL DEFAULT 0,
  discovered_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_youtube_recommendation_candidates_expiry
  ON youtube_recommendation_candidates(user_id, expires_at, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_recommendation_candidates_channel
  ON youtube_recommendation_candidates(user_id, channel_id, published_at DESC);

CREATE TABLE IF NOT EXISTS youtube_recommendation_feedback (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('video', 'channel')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('not_interested', 'dont_recommend_channel', 'dismiss_channel')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id, action)
);
CREATE INDEX IF NOT EXISTS idx_youtube_recommendation_feedback_user
  ON youtube_recommendation_feedback(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS youtube_recommendation_impressions (
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  impression_count INTEGER NOT NULL DEFAULT 0,
  last_shown_at INTEGER,
  last_viewed_at INTEGER,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_youtube_recommendation_impressions_recent
  ON youtube_recommendation_impressions(user_id, last_shown_at DESC);

CREATE TABLE IF NOT EXISTS youtube_recommendation_settings (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  selection_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS youtube_recommendation_topics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('interest', 'block')),
  match_mode TEXT NOT NULL DEFAULT 'words' CHECK (match_mode IN ('words', 'similar')),
  share INTEGER NOT NULL DEFAULT 0 CHECK (share BETWEEN 0 AND 35),
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_youtube_recommendation_topics_user
  ON youtube_recommendation_topics(user_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS youtube_discovery_state (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  active_at INTEGER NOT NULL DEFAULT 0,
  last_gathered_at INTEGER NOT NULL DEFAULT 0,
  next_gather_at INTEGER NOT NULL DEFAULT 0,
  gather_cursor INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_youtube_discovery_state_due
  ON youtube_discovery_state(next_gather_at, active_at DESC);
