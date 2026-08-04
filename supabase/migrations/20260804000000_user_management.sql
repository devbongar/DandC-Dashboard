-- ── profiles: add position column ────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS position text;

-- ── project_members table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('cm', 'reporter', 'viewer_site')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- ── indexes ───────────────────────────────────────────────────────────────────
-- project_id index omitted: UNIQUE (project_id, user_id) already covers it
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "project_members_admin_write" ON project_members
  FOR ALL
  USING      (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Authenticated users can read their own rows
CREATE POLICY "project_members_read_own" ON project_members
  FOR SELECT USING (user_id = auth.uid());
