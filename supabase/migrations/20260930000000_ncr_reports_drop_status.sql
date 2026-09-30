-- The NCR form's Resolution section (Corrective Action, Preventive Measure,
-- Date Rectified, Status) was removed -- nothing in the app sets `status`
-- anymore, so every row would sit at its 'open' default forever. Drop it.
-- (QOR keeps its own status column/workflow on project_qor_reports untouched.)

DROP INDEX IF EXISTS ncr_reports_status_idx;

ALTER TABLE project_ncr_reports
  DROP COLUMN IF EXISTS status;
