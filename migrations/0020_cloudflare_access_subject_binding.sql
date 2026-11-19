-- Bind Access-authenticated profiles and sessions to the signed JWT subject as well as email.
ALTER TABLE user_profiles ADD COLUMN access_subject TEXT;
ALTER TABLE sessions ADD COLUMN access_subject TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_access_subject
  ON sessions(user_id, access_subject);
