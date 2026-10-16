-- Link work program baselines to S-curve baselines.
--
-- Until now the two were connected only by a hand-typed name, and they had
-- already drifted: PRJ-000006 reads "Baseline 1, 2" on the S-curve against
-- "Baseline 02, 03" in the work program, and PRJ-000008 has seven work
-- program baselines including "Baseline 2" twice.
--
-- The link lives on workprogram_baselines, so several work program revisions
-- can hang off one S-curve baseline. ON DELETE SET NULL: dropping an S-curve
-- baseline unlinks the Gantt, it does not delete it.

ALTER TABLE workprogram_baselines
  ADD COLUMN IF NOT EXISTS scurve_baseline_id uuid
    REFERENCES project_scurve_baselines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workprogram_baselines_scurve_idx
  ON workprogram_baselines(scurve_baseline_id);

-- Backfill where the names agree once normalised ("Baseline 02" = "Baseline
-- 2"), and only where that normalised name is unique on BOTH sides within the
-- project. Ambiguous projects stay NULL and get paired by hand -- a wrong link
-- here would silently mis-state which Gantt a baseline's POC was planned from.
WITH norm AS (
  SELECT
    id, project_id,
    regexp_replace(regexp_replace(lower(btrim(name)), '[^a-z0-9]', '', 'g'), '0+([0-9])', '\1') AS key,
    'scurve' AS side
  FROM project_scurve_baselines
  UNION ALL
  SELECT
    id, project_id,
    regexp_replace(regexp_replace(lower(btrim(name)), '[^a-z0-9]', '', 'g'), '0+([0-9])', '\1') AS key,
    'wp' AS side
  FROM workprogram_baselines
),
unique_sides AS (
  -- there is no min(uuid); the HAVING guarantees a single row per group, so
  -- taking the first element of the array is exact, not arbitrary
  SELECT project_id, key, side, (array_agg(id))[1] AS id
  FROM norm
  GROUP BY project_id, key, side
  HAVING count(*) = 1
),
pairs AS (
  SELECT w.id AS wp_id, s.id AS scurve_id
  FROM unique_sides w
  JOIN unique_sides s
    ON s.project_id = w.project_id AND s.key = w.key AND s.side = 'scurve'
  WHERE w.side = 'wp'
)
UPDATE workprogram_baselines w
SET scurve_baseline_id = p.scurve_id
FROM pairs p
WHERE w.id = p.wp_id
  AND w.scurve_baseline_id IS NULL;

COMMENT ON COLUMN workprogram_baselines.scurve_baseline_id IS
  'The S-curve baseline this work program revision was planned against. NULL means unpaired; set it from the S-Curve tab.';
