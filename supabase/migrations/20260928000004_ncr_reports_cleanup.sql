-- The NCR form was redesigned to a simpler field set (group/item, defect,
-- description, root cause, reasons, affected activity, corrective action,
-- preventive measure, dates, status, photos). Drop the columns that belonged
-- to the old paper-style form and are no longer written by the app -- NCR now
-- only ever writes project_id, project_code, description, root_cause,
-- date_of_inspection, status and the `data` jsonb (which holds the rest).

DROP INDEX IF EXISTS ncr_reports_ref_idx;

ALTER TABLE project_ncr_reports
  DROP COLUMN IF EXISTS ncr_ref_no,
  DROP COLUMN IF EXISTS project_name,
  DROP COLUMN IF EXISTS contract_work_pkg,
  DROP COLUMN IF EXISTS contract_scope,
  DROP COLUMN IF EXISTS project_location;
