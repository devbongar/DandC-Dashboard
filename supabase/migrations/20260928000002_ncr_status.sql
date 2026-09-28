-- NCR status. Derived from Section 6.2 (all actions verified and accepted):
-- ticked YES closes the NCR, anything else leaves it open.

ALTER TABLE project_ncr_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

ALTER TABLE project_ncr_reports
  DROP CONSTRAINT IF EXISTS project_ncr_reports_status_check;

ALTER TABLE project_ncr_reports
  ADD CONSTRAINT project_ncr_reports_status_check
  CHECK (status IN ('open', 'closed'));

CREATE INDEX IF NOT EXISTS ncr_reports_status_idx ON project_ncr_reports(status);
