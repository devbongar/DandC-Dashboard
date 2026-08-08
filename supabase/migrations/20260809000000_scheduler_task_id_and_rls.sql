-- ── 1. task_id column on workprogram_activities ───────────────────────────────
-- Raw task id (the part before the baseline suffix in the composite `id` column).
-- Desktop app populates this going forward; existing rows will have '' until re-synced.

ALTER TABLE workprogram_activities
  ADD COLUMN IF NOT EXISTS task_id text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS workprogram_activities_task_id_idx
  ON workprogram_activities (task_id, baseline_id);

-- ── 2. Helper: is the user a member of a given project? ───────────────────────
-- Used in write policies so the desktop app (authenticated real user) can push
-- data for projects they're linked to, without needing the admin role.

CREATE OR REPLACE FUNCTION is_project_member(pid text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = pid
      AND user_id    = auth.uid()
  );
$$;

-- ── 3. projects: ensure RLS and scoped read for authenticated users ────────────
-- HO users (team = 'ho') see all projects.
-- Site users see only projects they're explicitly a member of.

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_ho_read"     ON projects;
DROP POLICY IF EXISTS "projects_member_read" ON projects;

CREATE POLICY "projects_ho_read" ON projects
  FOR SELECT USING (is_ho_user());

CREATE POLICY "projects_member_read" ON projects
  FOR SELECT USING (is_project_member(id));

-- ── 4. milestone_baselines ────────────────────────────────────────────────────

ALTER TABLE milestone_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "milestone_baselines_read"  ON milestone_baselines;
DROP POLICY IF EXISTS "milestone_baselines_write" ON milestone_baselines;

-- Any authenticated user can read (dashboard already shows this data publicly within the app).
CREATE POLICY "milestone_baselines_read" ON milestone_baselines
  FOR SELECT USING (auth.role() = 'authenticated');

-- Admin can write anything; project members can write rows for their own projects.
CREATE POLICY "milestone_baselines_write" ON milestone_baselines
  FOR ALL
  USING      (has_role('admin') OR is_project_member(project_id))
  WITH CHECK (has_role('admin') OR is_project_member(project_id));

-- ── 5. workprogram_activities ─────────────────────────────────────────────────

ALTER TABLE workprogram_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workprogram_activities_read"  ON workprogram_activities;
DROP POLICY IF EXISTS "workprogram_activities_write" ON workprogram_activities;

CREATE POLICY "workprogram_activities_read" ON workprogram_activities
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "workprogram_activities_write" ON workprogram_activities
  FOR ALL
  USING      (has_role('admin') OR is_project_member(project_id))
  WITH CHECK (has_role('admin') OR is_project_member(project_id));

-- ── 6. workprogram_dependencies ───────────────────────────────────────────────

ALTER TABLE workprogram_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workprogram_dependencies_read"  ON workprogram_dependencies;
DROP POLICY IF EXISTS "workprogram_dependencies_write" ON workprogram_dependencies;

CREATE POLICY "workprogram_dependencies_read" ON workprogram_dependencies
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "workprogram_dependencies_write" ON workprogram_dependencies
  FOR ALL
  USING      (has_role('admin') OR is_project_member(project_id))
  WITH CHECK (has_role('admin') OR is_project_member(project_id));
