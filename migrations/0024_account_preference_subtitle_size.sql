-- User-controlled subtitle scale for the native HLS/file player.
ALTER TABLE user_preferences
  ADD COLUMN subtitle_size TEXT NOT NULL DEFAULT 'medium'
  CHECK (subtitle_size IN ('small', 'medium', 'large'));
