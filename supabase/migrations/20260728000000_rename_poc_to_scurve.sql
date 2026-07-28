-- Rename S-curve tables from poc to scurve
ALTER TABLE project_poc RENAME TO project_scurve;
ALTER TABLE project_poc_pending RENAME TO project_scurve_pending;
