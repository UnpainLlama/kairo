-- Closed-access account model: usernames replace public email registration for sign-in.
ALTER TABLE user_profiles ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username
  ON user_profiles(username COLLATE NOCASE) WHERE username IS NOT NULL;

-- Enforce exactly one administrator account at the database layer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_single_admin
  ON user_profiles(role) WHERE role = 'admin';
