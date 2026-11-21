-- Deleted standard accounts are retained as minimal identity tombstones so a still-valid
-- Cloudflare Access JWT cannot automatically provision the former email again.
-- They no longer consume one of the 15 active/suspended standard-account seats.
DROP TRIGGER IF EXISTS trg_user_profiles_standard_cap_insert;
DROP TRIGGER IF EXISTS trg_user_profiles_standard_cap_role_update;
DROP TRIGGER IF EXISTS trg_user_profiles_standard_cap_status_update;

CREATE TRIGGER trg_user_profiles_standard_cap_insert
BEFORE INSERT ON user_profiles
WHEN NEW.role = 'user'
 AND NEW.account_status IN ('active', 'suspended')
 AND (SELECT COUNT(*) FROM user_profiles
      WHERE role = 'user' AND account_status IN ('active', 'suspended')) >= 15
BEGIN
  SELECT RAISE(ABORT, 'standard_account_limit_reached');
END;

CREATE TRIGGER trg_user_profiles_standard_cap_role_update
BEFORE UPDATE OF role ON user_profiles
WHEN NEW.role = 'user'
 AND NEW.account_status IN ('active', 'suspended')
 AND OLD.role <> 'user'
 AND (SELECT COUNT(*) FROM user_profiles
      WHERE role = 'user' AND account_status IN ('active', 'suspended')) >= 15
BEGIN
  SELECT RAISE(ABORT, 'standard_account_limit_reached');
END;

CREATE TRIGGER trg_user_profiles_standard_cap_status_update
BEFORE UPDATE OF account_status ON user_profiles
WHEN NEW.role = 'user'
 AND NEW.account_status IN ('active', 'suspended')
 AND OLD.account_status = 'deleted'
 AND (SELECT COUNT(*) FROM user_profiles
      WHERE role = 'user' AND account_status IN ('active', 'suspended')) >= 15
BEGIN
  SELECT RAISE(ABORT, 'standard_account_limit_reached');
END;
