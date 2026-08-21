-- Convert workprogram_activities.id and parent_id from uuid to text
-- so composite string IDs (e.g. "taskUUID_baselineUUID") can be stored.
-- Also converts workprogram_dependencies.from_id and to_id to text.

-- 1. Drop FKs on workprogram_dependencies that reference workprogram_activities.id
ALTER TABLE workprogram_dependencies
  DROP CONSTRAINT IF EXISTS milestone_dependencies_from_id_fkey,
  DROP CONSTRAINT IF EXISTS milestone_dependencies_to_id_fkey;

-- 2. Drop self-referencing FK on parent_id
ALTER TABLE workprogram_activities
  DROP CONSTRAINT IF EXISTS project_milestones_parent_id_fkey;

-- 3. Drop primary key (no CASCADE needed now that FKs are gone)
ALTER TABLE workprogram_activities
  DROP CONSTRAINT IF EXISTS project_milestones_pkey;
ALTER TABLE workprogram_activities
  DROP CONSTRAINT IF EXISTS workprogram_activities_pkey;

-- 4. Convert id to text
ALTER TABLE workprogram_activities
  ALTER COLUMN id TYPE text USING id::text;

-- 5. Re-add primary key
ALTER TABLE workprogram_activities
  ADD CONSTRAINT workprogram_activities_pkey PRIMARY KEY (id);

-- 6. Convert parent_id to text
ALTER TABLE workprogram_activities
  ALTER COLUMN parent_id TYPE text USING parent_id::text;

-- 7. Convert workprogram_dependencies.from_id and to_id to text
ALTER TABLE workprogram_dependencies
  ALTER COLUMN from_id TYPE text USING from_id::text,
  ALTER COLUMN to_id   TYPE text USING to_id::text;
