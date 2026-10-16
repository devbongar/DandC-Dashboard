-- Normalise work program baseline names to "Baseline <n>".
--
-- The Gantt now generates the name from a number, so new baselines are
-- uniform. This brings the existing rows into the same form: "Baseline 02"
-- and "Baseline 03" become "Baseline 2" and "Baseline 3".
--
-- Only rows whose name ends in a number are touched, and only where the
-- normalised name would not collide with another baseline in the same
-- project -- renaming two rows onto one name would make them
-- indistinguishable, which is the problem this is meant to end.

WITH parsed AS (
  SELECT
    id,
    project_id,
    name,
    (regexp_match(name, '(\d+)\s*$'))[1]::int AS num
  FROM workprogram_baselines
  WHERE name ~ '\d+\s*$'
),
targets AS (
  SELECT id, project_id, name, 'Baseline ' || num AS new_name
  FROM parsed
),
safe AS (
  SELECT t.*
  FROM targets t
  WHERE t.new_name <> t.name
    -- nothing else in the project already holds the target name
    AND NOT EXISTS (
      SELECT 1 FROM workprogram_baselines o
      WHERE o.project_id = t.project_id AND o.id <> t.id AND o.name = t.new_name
    )
    -- and no two rows are being renamed onto the same name
    AND (SELECT count(*) FROM targets x
         WHERE x.project_id = t.project_id AND x.new_name = t.new_name) = 1
)
UPDATE workprogram_baselines b
SET name = s.new_name
FROM safe s
WHERE b.id = s.id;

-- One baseline per name per project, enforced in the database. The Gantt
-- already blocks a taken number in the UI, but two people creating a baseline
-- at the same moment would both pass that check.
CREATE UNIQUE INDEX IF NOT EXISTS workprogram_baselines_project_name_key
  ON workprogram_baselines(project_id, name);
