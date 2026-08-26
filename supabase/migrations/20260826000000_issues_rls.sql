-- Issues table RLS: match UI role gates (admin, head, reporter, endorser can write)
-- The issues table was created directly in Supabase with RLS enabled.
-- This migration adds the missing non-admin write policies.

-- SELECT: all authenticated HO users can read issues
DROP POLICY IF EXISTS issues_select ON issues;
CREATE POLICY issues_select ON issues
  FOR SELECT USING (is_ho_user());

-- INSERT: admin, head, reporter, endorser can add issues
DROP POLICY IF EXISTS issues_insert ON issues;
CREATE POLICY issues_insert ON issues
  FOR INSERT WITH CHECK (has_any_role(ARRAY['admin','head','reporter','endorser']));

-- UPDATE: admin, head, reporter, endorser can edit issues
DROP POLICY IF EXISTS issues_update ON issues;
CREATE POLICY issues_update ON issues
  FOR UPDATE USING (has_any_role(ARRAY['admin','head','reporter','endorser']));

-- DELETE: admin, head, reporter, endorser can delete issues
DROP POLICY IF EXISTS issues_delete ON issues;
CREATE POLICY issues_delete ON issues
  FOR DELETE USING (has_any_role(ARRAY['admin','head','reporter','endorser']));
