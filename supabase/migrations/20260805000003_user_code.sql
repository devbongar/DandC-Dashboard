-- ── user_code: add column + sequence + trigger ────────────────────────────────

-- Create sequence for user codes (starts at 1, increments by 1)
CREATE SEQUENCE IF NOT EXISTS user_code_seq START 1 INCREMENT 1;

-- Add user_code column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_code text UNIQUE NOT NULL DEFAULT '';

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_code ON profiles(user_code);

-- Function to generate next user code
CREATE OR REPLACE FUNCTION next_user_code()
RETURNS text AS $$
BEGIN
  RETURN 'USR-' || LPAD(nextval('user_code_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign user_code on INSERT
CREATE OR REPLACE FUNCTION assign_user_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_code = '' OR NEW.user_code IS NULL THEN
    NEW.user_code := next_user_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assign_user_code_trigger ON profiles;
CREATE TRIGGER assign_user_code_trigger
BEFORE INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION assign_user_code();

-- ── Backfill existing users ───────────────────────────────────────────────────

-- Set sequence to correct position
SELECT setval('user_code_seq', COALESCE((SELECT COUNT(*) FROM profiles), 0) + 1);

-- Assign codes to existing users in order of creation
DO $$
DECLARE
  user_row profiles%ROWTYPE;
  counter INTEGER := 1;
BEGIN
  FOR user_row IN
    SELECT * FROM profiles
    WHERE user_code = '' OR user_code IS NULL
    ORDER BY created_at ASC
  LOOP
    UPDATE profiles
    SET user_code = 'USR-' || LPAD(counter::text, 6, '0')
    WHERE id = user_row.id;
    counter := counter + 1;
  END LOOP;
END $$;
