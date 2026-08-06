-- permit_remarks: logged remarks feed per permit
CREATE TABLE permit_remarks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id  text        NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  body       text        NOT NULL,
  created_by uuid        NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE permit_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read remarks"
ON permit_remarks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone authenticated can insert own remarks"
ON permit_remarks FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

-- Migrate existing remarks; fall back to first admin if permit has no created_by
INSERT INTO permit_remarks (permit_id, body, created_by, created_at)
SELECT
  p.id,
  p.remarks,
  COALESCE(p.created_by, (SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1)),
  p.created_at
FROM permits p
WHERE p.remarks IS NOT NULL AND p.remarks != '';

-- Drop old single-field remarks column
ALTER TABLE permits DROP COLUMN remarks;
