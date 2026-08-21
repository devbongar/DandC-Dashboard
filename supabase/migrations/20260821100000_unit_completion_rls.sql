-- Allow all authenticated users to read and write unit completion data
ALTER TABLE project_unit_completion         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_parking_unit_completion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uc_select  ON project_unit_completion;
DROP POLICY IF EXISTS uc_insert  ON project_unit_completion;
DROP POLICY IF EXISTS uc_update  ON project_unit_completion;
DROP POLICY IF EXISTS uc_delete  ON project_unit_completion;

CREATE POLICY uc_select ON project_unit_completion         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY uc_insert ON project_unit_completion         FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY uc_update ON project_unit_completion         FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY uc_delete ON project_unit_completion         FOR DELETE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS puc_select ON project_parking_unit_completion;
DROP POLICY IF EXISTS puc_insert ON project_parking_unit_completion;
DROP POLICY IF EXISTS puc_update ON project_parking_unit_completion;
DROP POLICY IF EXISTS puc_delete ON project_parking_unit_completion;

CREATE POLICY puc_select ON project_parking_unit_completion FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY puc_insert ON project_parking_unit_completion FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY puc_update ON project_parking_unit_completion FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY puc_delete ON project_parking_unit_completion FOR DELETE USING (auth.role() = 'authenticated');
