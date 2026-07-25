-- Allow baselines to be "confirmed" (locked for planning edits).
-- NULL = still a draft; NOT NULL = saved/confirmed, planned dates locked.
ALTER TABLE milestone_baselines ADD COLUMN IF NOT EXISTS confirmed_at timestamptz DEFAULT NULL;
