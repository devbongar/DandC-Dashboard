-- Allow a user to update their own profile row (avatar, name, position),
-- which was previously missing -- only an admin-only UPDATE policy existed,
-- so self-service avatar/name edits from ProfilePage silently failed RLS
-- and never persisted past a refresh.

CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE
  USING      (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Guard against a self-update escalating privilege by changing role/team/
-- user_code/email; only an admin (checked separately by the admin policy
-- above) may change those fields.
CREATE OR REPLACE FUNCTION prevent_self_profile_escalation()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() = OLD.id
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  THEN
    NEW.role      := OLD.role;
    NEW.team      := OLD.team;
    NEW.user_code := OLD.user_code;
    NEW.email     := OLD.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS prevent_self_profile_escalation_trigger ON profiles;
CREATE TRIGGER prevent_self_profile_escalation_trigger
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_self_profile_escalation();
