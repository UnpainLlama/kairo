-- Closed-access account model: usernames replace public email registration for sign-in.
ALTER TABLE user_profiles ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username
  ON user_profiles(username COLLATE NOCASE) WHERE username IS NOT NULL;
