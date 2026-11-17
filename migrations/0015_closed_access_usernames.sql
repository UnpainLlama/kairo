-- Closed-access account model: usernames replace public email registration for sign-in.
ALTER TABLE user_profiles ADD COLUMN username TEXT;
UPDATE user_profiles
SET username = 'user_' || lower(substr(replace(id, '-', ''), 1, 12))
WHERE username IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username
  ON user_profiles(username COLLATE NOCASE) WHERE username IS NOT NULL;

-- Enforce exactly one administrator account at the database layer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_single_admin
  ON user_profiles(role) WHERE role = 'admin';

-- Enforce the 15-standard-account allocation limit at the database boundary.
-- Suspended and deleted accounts continue to consume a slot.
CREATE TRIGGER IF NOT EXISTS trg_user_profiles_standard_cap_insert
BEFORE INSERT ON user_profiles
WHEN NEW.role = 'user'
 AND (SELECT COUNT(*) FROM user_profiles WHERE role = 'user') >= 15
BEGIN
  SELECT RAISE(ABORT, 'standard_account_limit_reached');
END;

CREATE TRIGGER IF NOT EXISTS trg_user_profiles_standard_cap_role_update
BEFORE UPDATE OF role ON user_profiles
WHEN NEW.role = 'user'
 AND OLD.role <> 'user'
 AND (SELECT COUNT(*) FROM user_profiles WHERE role = 'user') >= 15
BEGIN
  SELECT RAISE(ABORT, 'standard_account_limit_reached');
END;
