-- Cache the public uploads playlist for each Kairo-selected channel.
-- Existing rows are hydrated lazily by the next feed request.
ALTER TABLE youtube_feed_channels ADD COLUMN upload_playlist_id TEXT;
