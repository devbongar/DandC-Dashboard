-- A work program can exist before it is a baseline.
--
-- Starting a schedule used to mean naming "Baseline 1" first, which produced
-- a baseline whose dates were blank -- there was nowhere for them to come
-- from yet. A baseline is a snapshot of an agreed plan; it cannot be the
-- thing you create before the plan exists.
--
-- Activities key off baseline_id, so the container row still has to be there.
-- It is now marked as a draft: a working schedule that is not a baseline. The
-- team builds it, sets dates, and tags it "Baseline <n>" when it is agreed.

ALTER TABLE workprogram_baselines
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN workprogram_baselines.is_draft IS
  'True while this is a working schedule that has not been tagged as a baseline. Draft rows are not offered as S-curve pairings and carry no baseline number.';

-- Every existing row was created through the old flow, so they are all
-- baselines proper; the default of false already says so.
