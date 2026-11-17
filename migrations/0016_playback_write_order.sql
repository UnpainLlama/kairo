-- Preserve per-tab playback write ordering while using Worker receive time as the
-- authoritative timestamp. A different playback session uses server-time LWW.
ALTER TABLE user_media_playback ADD COLUMN session_id TEXT;
ALTER TABLE user_media_playback ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;
