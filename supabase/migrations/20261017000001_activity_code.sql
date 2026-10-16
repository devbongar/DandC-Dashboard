-- Stable activity codes (A1000, A1010, ...).
--
-- The grid identifies rows by their position, so a predecessor written as "3"
-- means something different the moment rows are reordered. A code is assigned
-- once and never changes.
--
-- Codes belong to the activity, not the baseline: task_id is carried over when
-- a baseline is copied, so the same activity keeps one code across every
-- revision of the programme. Steps of 10 leave room to insert between two
-- rows without renumbering.

ALTER TABLE workprogram_activities
  ADD COLUMN IF NOT EXISTS activity_code text;

-- One code per activity per baseline. Not unique per project: the same
-- activity appears once in each baseline and shares its code across them.
CREATE UNIQUE INDEX IF NOT EXISTS workprogram_activities_code_key
  ON workprogram_activities(baseline_id, activity_code)
  WHERE activity_code IS NOT NULL;

-- Backfill: number each project's distinct activities in the order they are
-- displayed, then give every copy of that activity the same code.
WITH ranked AS (
  SELECT
    project_id,
    task_id,
    row_number() OVER (
      PARTITION BY project_id
      ORDER BY min(sort_order), min(created_at), task_id
    ) AS n
  FROM workprogram_activities
  WHERE task_id IS NOT NULL
  GROUP BY project_id, task_id
)
UPDATE workprogram_activities a
SET activity_code = 'A' || (1000 + (r.n - 1) * 10)
FROM ranked r
WHERE a.project_id = r.project_id
  AND a.task_id = r.task_id
  AND a.activity_code IS NULL;

COMMENT ON COLUMN workprogram_activities.activity_code IS
  'Stable identifier (A1000, A1010, ...). Assigned on creation, shared by every baseline copy of the same activity, never renumbered.';
