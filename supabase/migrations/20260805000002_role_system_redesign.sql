-- supabase/migrations/20260805000002_role_system_redesign.sql

-- 0. Drop role check first so backfill and role migration can run freely
--    (may already exist with new values from a partial prior run)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 1. Add team column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS team TEXT;

-- 2. Backfill team based on old role values
UPDATE profiles SET team = CASE
  WHEN role IN ('admin', 'head', 'reviewer', 'approver', 'updater', 'viewer_ho', 'viewer') THEN 'ho'
  WHEN role IN ('cm', 'reporter', 'viewer_site')                                            THEN 'site'
  -- Users with NULL role had no global role (site users pre-migration)
  ELSE 'site'
END;

-- 3. Migrate role values
UPDATE profiles SET role = CASE
  WHEN role = 'approver'    THEN 'reviewer'
  WHEN role = 'updater'     THEN 'reporter'
  WHEN role = 'viewer_ho'   THEN 'viewer'
  WHEN role = 'cm'          THEN 'endorser'
  WHEN role = 'viewer_site' THEN 'viewer'
  -- admin, head, reviewer, reporter, viewer already match
  ELSE role
END;

-- 4. Add NOT NULL constraint and check constraint on team
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_team_check;
ALTER TABLE profiles
  ALTER COLUMN team SET NOT NULL,
  ADD CONSTRAINT profiles_team_check CHECK (team IN ('ho', 'site'));

-- 5. Add check constraint on role (new allowed values only)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'head', 'reviewer', 'endorser', 'reporter', 'viewer'));

-- 6. Drop project_members.role column (role is now on profiles)
ALTER TABLE project_members
  DROP COLUMN IF EXISTS role;
