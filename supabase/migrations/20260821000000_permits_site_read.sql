-- Allow all authenticated users to read permits, requirements, and permit_issues
DROP POLICY IF EXISTS permits_select ON permits;
CREATE POLICY permits_select ON permits FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS preq_select ON permit_requirements;
CREATE POLICY preq_select ON permit_requirements FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pissue_select ON permit_issues;
CREATE POLICY pissue_select ON permit_issues FOR SELECT USING (auth.role() = 'authenticated');
