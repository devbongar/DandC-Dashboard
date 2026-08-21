-- Add sort_order to project_floors and project_parking_floors
ALTER TABLE project_floors         ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE project_parking_floors ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill: assign sort_order per building_id based on existing row order
UPDATE project_floors f
SET sort_order = sub.rn - 1
FROM (
  SELECT id, row_number() OVER (PARTITION BY building_id ORDER BY id) AS rn
  FROM project_floors
) sub
WHERE f.id = sub.id;

UPDATE project_parking_floors f
SET sort_order = sub.rn - 1
FROM (
  SELECT id, row_number() OVER (PARTITION BY building_id ORDER BY id) AS rn
  FROM project_parking_floors
) sub
WHERE f.id = sub.id;
