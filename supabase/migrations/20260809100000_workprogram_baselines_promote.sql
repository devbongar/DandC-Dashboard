-- Promote workprogram_baselines to be the single source of truth for
-- work-program baselines by adding the columns that milestone_baselines had
-- (start_date, confirmed_at) and migrating their values.

-- ── 1. Add missing columns ──────────────────────────────────────────────────
ALTER TABLE workprogram_baselines
  ADD COLUMN IF NOT EXISTS start_date   text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- ── 2. Back-fill from milestone_baselines ───────────────────────────────────
-- Both tables share the same id (uuid), copied 1:1 in the 20260804000002
-- workprogram_redesign migration.
-- milestone_baselines.start_date is text; workprogram_baselines.start_date is date
UPDATE workprogram_baselines wb
SET
  start_date   = mb.start_date::date,
  confirmed_at = mb.confirmed_at
FROM milestone_baselines mb
WHERE mb.id = wb.id
  AND mb.start_date IS NOT NULL;

-- ── 3. Project-member write policy (desktop scheduler) ──────────────────────
-- The existing policies allow admin full access and authenticated read.
-- Add a write policy so project members (desktop app user) can insert/update.

DROP POLICY IF EXISTS "workprogram_baselines_member_write" ON workprogram_baselines;

CREATE POLICY "workprogram_baselines_member_write" ON workprogram_baselines
  FOR ALL
  USING      (has_role('admin') OR is_project_member(project_id))
  WITH CHECK (has_role('admin') OR is_project_member(project_id));
