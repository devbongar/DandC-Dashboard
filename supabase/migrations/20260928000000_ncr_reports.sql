-- Non-Conformance Reports (Quality Assurance tab).
-- Frequently queried fields are real columns so an NCR Log can filter/sort on
-- them; the rest of the form (signatories, action tables, reviews, close out)
-- lives in `data` so the form layout can keep evolving without a migration.

CREATE TABLE IF NOT EXISTS project_ncr_reports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_code       text,
  ncr_ref_no         text,
  project_name       text,
  contract_work_pkg  text,
  contract_scope     text,
  project_location   text,
  date_of_inspection date,
  description        text,
  root_cause         text,
  data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         uuid REFERENCES auth.users,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ncr_reports_project_idx ON project_ncr_reports(project_id);
CREATE INDEX IF NOT EXISTS ncr_reports_ref_idx     ON project_ncr_reports(ncr_ref_no);

ALTER TABLE project_ncr_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ncr_select ON project_ncr_reports;
CREATE POLICY ncr_select ON project_ncr_reports
  FOR SELECT USING (is_ho_user());

DROP POLICY IF EXISTS ncr_insert ON project_ncr_reports;
CREATE POLICY ncr_insert ON project_ncr_reports
  FOR INSERT WITH CHECK (has_any_role(ARRAY['admin','head','reporter','endorser']));

DROP POLICY IF EXISTS ncr_update ON project_ncr_reports;
CREATE POLICY ncr_update ON project_ncr_reports
  FOR UPDATE USING (has_any_role(ARRAY['admin','head','reporter','endorser']));

DROP POLICY IF EXISTS ncr_delete ON project_ncr_reports;
CREATE POLICY ncr_delete ON project_ncr_reports
  FOR DELETE USING (has_any_role(ARRAY['admin','head','reporter','endorser']));
