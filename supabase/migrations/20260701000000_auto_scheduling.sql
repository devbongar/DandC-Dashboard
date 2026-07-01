-- Add duration (calendar days) to each milestone row.
-- Null = unschedulable; parent task rows are always null (dates rolled up from children).
ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS duration integer;

-- Add scheduling mode and start date to each baseline.
-- scheduling_mode: 'auto' (dates computed) | 'manual' (dates typed).
-- start_date: ISO date string anchoring the forward pass. Null = scheduler does not run.
ALTER TABLE milestone_baselines
  ADD COLUMN IF NOT EXISTS scheduling_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS start_date text;
