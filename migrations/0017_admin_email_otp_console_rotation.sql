-- 30-minute private administrator console paths.
CREATE TABLE IF NOT EXISTS admin_console_access (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  path_value TEXT NOT NULL,
  rotated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
