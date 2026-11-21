-- Pause-history is an account preference shared by Anime and Movies across devices.
ALTER TABLE user_preferences
  ADD COLUMN history_paused INTEGER NOT NULL DEFAULT 0
  CHECK (history_paused IN (0, 1));
