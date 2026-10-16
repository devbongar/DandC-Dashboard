-- Project discussion thread, shown in the Work Program page's project panel.
--
-- One flat thread per project -- no replies, no attachments. The point is a
-- place to say "precast slipped again, PM is on it" next to the numbers that
-- show it, not a second issues register: anything that needs tracking belongs
-- in `issues`.
--
-- Access:
--   read   : every signed-in user, same as project_ncr_reports -- site teams
--            need to follow the thread on their own projects
--   write  : every signed-in user (a comment is not a record of work)
--   edit   : the author only
--   delete : the author, or an admin

CREATE TABLE IF NOT EXISTS project_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 2000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at  timestamptz
);

CREATE INDEX IF NOT EXISTS project_comments_project_idx
  ON project_comments(project_id, created_at DESC);

ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_comments_select ON project_comments;
CREATE POLICY project_comments_select ON project_comments
  FOR SELECT TO authenticated USING (true);

-- created_by is pinned to the caller so a client cannot post as someone else
DROP POLICY IF EXISTS project_comments_insert ON project_comments;
CREATE POLICY project_comments_insert ON project_comments
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS project_comments_update ON project_comments;
CREATE POLICY project_comments_update ON project_comments
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS project_comments_delete ON project_comments;
CREATE POLICY project_comments_delete ON project_comments
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_any_role(ARRAY['admin']));
