-- Expand permits UPDATE: allow admin, head, reporter
DROP POLICY IF EXISTS permits_update ON permits;
CREATE POLICY permits_update ON permits
  FOR UPDATE USING (has_any_role(ARRAY['admin','head','reporter']));

-- Expand permit_requirements INSERT/UPDATE: allow admin, head, reporter
DROP POLICY IF EXISTS preq_insert ON permit_requirements;
DROP POLICY IF EXISTS preq_update ON permit_requirements;
CREATE POLICY preq_insert ON permit_requirements
  FOR INSERT WITH CHECK (has_any_role(ARRAY['admin','head','reporter']));
CREATE POLICY preq_update ON permit_requirements
  FOR UPDATE USING (has_any_role(ARRAY['admin','head','reporter']));
