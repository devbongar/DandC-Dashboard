-- Add remaining_duration for scheduler sync (all other date columns already exist)
ALTER TABLE workprogram_activities
  ADD COLUMN IF NOT EXISTS remaining_duration numeric;

-- Add lag to dependency links
ALTER TABLE workprogram_dependencies
  ADD COLUMN IF NOT EXISTS lag integer NOT NULL DEFAULT 0;
