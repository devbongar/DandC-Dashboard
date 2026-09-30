-- Quality Findings reports get an Open/Closed status again, this time driven by
-- a toggle at the top of the form. 20260930000000 dropped the column because
-- the redesigned form stopped writing it; now it does, and the findings log
-- needs to filter on it, so it goes back as a real column rather than into the
-- `data` jsonb.

ALTER TABLE project_ncr_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

ALTER TABLE project_ncr_reports
  DROP CONSTRAINT IF EXISTS project_ncr_reports_status_check;

ALTER TABLE project_ncr_reports
  ADD CONSTRAINT project_ncr_reports_status_check CHECK (status IN ('open', 'closed'));

CREATE INDEX IF NOT EXISTS ncr_reports_status_idx ON project_ncr_reports(project_id, status);
