-- supabase/migrations/20260805000004_permits_module.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SEQUENCE + TRIGGER for PRMT-000001 text PK
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS permits_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_permit_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := 'PRMT-' || LPAD(nextval('permits_id_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. permits
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permits (
  id                  text PRIMARY KEY DEFAULT '',
  project_id          text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                text NOT NULL,
  responsible_person  text,
  planned_start       date,
  planned_finish      date,
  forecast_start      date,
  forecast_finish     date,
  actual_start        date,
  actual_finish       date,
  remaining_duration  numeric,
  status              text CHECK (status IN ('pending','in-progress','acquired','overdue')),
  remarks             text,
  created_by          uuid REFERENCES auth.users,
  created_at          timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_permit_id ON permits;
CREATE TRIGGER set_permit_id
  BEFORE INSERT ON permits
  FOR EACH ROW EXECUTE FUNCTION generate_permit_id();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. permit_requirements
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permit_requirements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id    text NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  description  text NOT NULL,
  is_complete  boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. permit_issues
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permit_issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id    text NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  issue        text NOT NULL,
  description  text,
  raised_by    uuid REFERENCES auth.users,
  assigned_to  uuid REFERENCES auth.users,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type       text,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. app_settings (key-value store for admin config like Teams webhook)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

-- Seed the Teams webhook key so it's discoverable even before configuration
INSERT INTO app_settings (key, value)
VALUES ('teams_webhook_url', '')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS permits_project_id_idx       ON permits(project_id);
CREATE INDEX IF NOT EXISTS permits_status_idx           ON permits(status);
CREATE INDEX IF NOT EXISTS permit_requirements_permit_idx ON permit_requirements(permit_id);
CREATE INDEX IF NOT EXISTS permit_issues_permit_idx     ON permit_issues(permit_id);
CREATE INDEX IF NOT EXISTS permit_issues_assigned_idx   ON permit_issues(assigned_to);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_at_idx    ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE permits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_requirements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit_issues          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings           ENABLE ROW LEVEL SECURITY;

-- Helper: is the calling user an HO user (team = 'ho')?
-- (profiles.team column added by Plan D / role-system-redesign migration)
CREATE OR REPLACE FUNCTION is_ho_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT team = 'ho' FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION has_role(r text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role = r FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION has_any_role(roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role = ANY(roles) FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- permits: HO users can SELECT. Admin only for INSERT/UPDATE/DELETE.
CREATE POLICY permits_select   ON permits FOR SELECT USING (is_ho_user());
CREATE POLICY permits_insert   ON permits FOR INSERT WITH CHECK (has_role('admin'));
CREATE POLICY permits_update   ON permits FOR UPDATE USING (has_role('admin'));
CREATE POLICY permits_delete   ON permits FOR DELETE USING (has_role('admin'));

-- permit_requirements: HO users SELECT. Admin/head INSERT/UPDATE/DELETE.
CREATE POLICY preq_select ON permit_requirements FOR SELECT USING (is_ho_user());
CREATE POLICY preq_insert ON permit_requirements FOR INSERT WITH CHECK (has_any_role(ARRAY['admin','head']));
CREATE POLICY preq_update ON permit_requirements FOR UPDATE USING (has_any_role(ARRAY['admin','head']));
CREATE POLICY preq_delete ON permit_requirements FOR DELETE USING (has_any_role(ARRAY['admin','head']));

-- permit_issues: HO users SELECT and INSERT. Admin/head UPDATE (resolve).
CREATE POLICY pissue_select ON permit_issues FOR SELECT USING (is_ho_user());
CREATE POLICY pissue_insert ON permit_issues FOR INSERT WITH CHECK (is_ho_user());
CREATE POLICY pissue_update ON permit_issues FOR UPDATE USING (has_any_role(ARRAY['admin','head']));

-- notifications: users see and update only their own rows.
CREATE POLICY notif_select ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_update ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY notif_insert ON notifications FOR INSERT WITH CHECK (true); -- server/edge inserts

-- app_settings: admin can manage; HO users can read (for webhook presence detection).
CREATE POLICY appsettings_select ON app_settings FOR SELECT USING (is_ho_user());
CREATE POLICY appsettings_update ON app_settings FOR UPDATE USING (has_role('admin'));
CREATE POLICY appsettings_insert ON app_settings FOR INSERT WITH CHECK (has_role('admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Realtime — enable publications for in-app notifications
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE permit_issues;
