-- ── 20260805000001_project_id_text_pk.sql ────────────────────────────────────
-- Converts projects.id from uuid to text in PRJ-000001 format.
-- A sequence + BEFORE INSERT trigger auto-assigns ids.
-- All child tables' project_id columns are changed from uuid to text.
-- DEV-ONLY: wipes all project data via CASCADE. Destructive.

-- ── 1. Wipe all data ──────────────────────────────────────────────────────────
TRUNCATE projects CASCADE;

-- ── 2. Drop FK constraints on all child tables ────────────────────────────────
-- Postgres auto-names inline FKs as <table>_<column>_fkey.
-- IF EXISTS handles any that were named differently via the Supabase UI.
ALTER TABLE project_photos                    DROP CONSTRAINT IF EXISTS project_photos_project_id_fkey;
ALTER TABLE project_scurve_baselines          DROP CONSTRAINT IF EXISTS project_scurve_baselines_project_id_fkey;
ALTER TABLE scurve_baseline_data              DROP CONSTRAINT IF EXISTS scurve_baseline_data_project_id_fkey;
ALTER TABLE scurve_actual                     DROP CONSTRAINT IF EXISTS scurve_actual_project_id_fkey;
ALTER TABLE scurve_forecast                   DROP CONSTRAINT IF EXISTS scurve_forecast_project_id_fkey;
ALTER TABLE project_members                   DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;
ALTER TABLE workprogram_tasks                 DROP CONSTRAINT IF EXISTS workprogram_tasks_project_id_fkey;
ALTER TABLE workprogram_baselines             DROP CONSTRAINT IF EXISTS workprogram_baselines_project_id_fkey;
ALTER TABLE issues                            DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE project_permits                   DROP CONSTRAINT IF EXISTS project_permits_project_id_fkey;
ALTER TABLE project_floors                    DROP CONSTRAINT IF EXISTS project_floors_project_id_fkey;
ALTER TABLE project_unit_completion           DROP CONSTRAINT IF EXISTS project_unit_completion_project_id_fkey;
ALTER TABLE project_buildings                 DROP CONSTRAINT IF EXISTS project_buildings_project_id_fkey;
ALTER TABLE project_parking_floors            DROP CONSTRAINT IF EXISTS project_parking_floors_project_id_fkey;
ALTER TABLE project_parking_unit_completion   DROP CONSTRAINT IF EXISTS project_parking_unit_completion_project_id_fkey;
ALTER TABLE esa_issues                        DROP CONSTRAINT IF EXISTS esa_issues_project_id_fkey;
ALTER TABLE project_unit_types                DROP CONSTRAINT IF EXISTS project_unit_types_project_id_fkey;
ALTER TABLE project_parking                   DROP CONSTRAINT IF EXISTS project_parking_project_id_fkey;
ALTER TABLE project_amenities                 DROP CONSTRAINT IF EXISTS project_amenities_project_id_fkey;
ALTER TABLE workprogram_activities            DROP CONSTRAINT IF EXISTS project_milestones_project_id_fkey;
ALTER TABLE milestone_baselines               DROP CONSTRAINT IF EXISTS milestone_baselines_project_id_fkey;
ALTER TABLE workprogram_dependencies          DROP CONSTRAINT IF EXISTS milestone_dependencies_project_id_fkey;
ALTER TABLE project_poc                       DROP CONSTRAINT IF EXISTS project_poc_project_id_fkey;
ALTER TABLE project_poc_pending               DROP CONSTRAINT IF EXISTS project_poc_pending_project_id_fkey;

-- ── 3. Change projects.id from uuid to text ───────────────────────────────────
-- Drop PK first (required before altering the PK column type).
ALTER TABLE projects DROP CONSTRAINT projects_pkey;

-- uuid has an implicit cast to text in Postgres; with zero rows this is trivial.
ALTER TABLE projects
  ALTER COLUMN id TYPE text,
  ALTER COLUMN id DROP DEFAULT;      -- removes gen_random_uuid(); trigger takes over

-- Restore PK.
ALTER TABLE projects ADD PRIMARY KEY (id);

-- Enforce the PRJ-XXXXXX pattern at the DB level.
ALTER TABLE projects
  ADD CONSTRAINT projects_id_format CHECK (id ~ '^PRJ-[0-9]{6}$');

-- ── 4. Sequence + auto-assign trigger ─────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS projects_code_seq START 1;

CREATE OR REPLACE FUNCTION assign_project_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := 'PRJ-' || lpad(nextval('projects_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_project_id ON projects;
CREATE TRIGGER trg_assign_project_id
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION assign_project_id();

-- ── 5. Change project_id columns to text on all child tables ──────────────────
-- Implicit uuid::text cast; all rows were wiped in step 1, so trivially safe.
ALTER TABLE project_photos                    ALTER COLUMN project_id TYPE text;
ALTER TABLE project_scurve_baselines          ALTER COLUMN project_id TYPE text;
ALTER TABLE scurve_baseline_data              ALTER COLUMN project_id TYPE text;
ALTER TABLE scurve_actual                     ALTER COLUMN project_id TYPE text;
ALTER TABLE scurve_forecast                   ALTER COLUMN project_id TYPE text;
ALTER TABLE project_members                   ALTER COLUMN project_id TYPE text;
ALTER TABLE workprogram_tasks                 ALTER COLUMN project_id TYPE text;
ALTER TABLE workprogram_baselines             ALTER COLUMN project_id TYPE text;
ALTER TABLE issues                            ALTER COLUMN project_id TYPE text;
ALTER TABLE project_permits                   ALTER COLUMN project_id TYPE text;
ALTER TABLE project_floors                    ALTER COLUMN project_id TYPE text;
ALTER TABLE project_unit_completion           ALTER COLUMN project_id TYPE text;
ALTER TABLE project_buildings                 ALTER COLUMN project_id TYPE text;
ALTER TABLE project_parking_floors            ALTER COLUMN project_id TYPE text;
ALTER TABLE project_parking_unit_completion   ALTER COLUMN project_id TYPE text;
ALTER TABLE esa_issues                        ALTER COLUMN project_id TYPE text;
ALTER TABLE project_unit_types                ALTER COLUMN project_id TYPE text;
ALTER TABLE project_parking                   ALTER COLUMN project_id TYPE text;
ALTER TABLE project_amenities                 ALTER COLUMN project_id TYPE text;
ALTER TABLE workprogram_activities            ALTER COLUMN project_id TYPE text;
ALTER TABLE milestone_baselines               ALTER COLUMN project_id TYPE text;
ALTER TABLE workprogram_dependencies          ALTER COLUMN project_id TYPE text;
ALTER TABLE project_poc                       ALTER COLUMN project_id TYPE text;
ALTER TABLE project_poc_pending               ALTER COLUMN project_id TYPE text;

-- ── 6. Recreate FK constraints ────────────────────────────────────────────────
ALTER TABLE project_photos
  ADD CONSTRAINT project_photos_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_scurve_baselines
  ADD CONSTRAINT project_scurve_baselines_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE scurve_baseline_data
  ADD CONSTRAINT scurve_baseline_data_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE scurve_actual
  ADD CONSTRAINT scurve_actual_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE scurve_forecast
  ADD CONSTRAINT scurve_forecast_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_members
  ADD CONSTRAINT project_members_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE workprogram_tasks
  ADD CONSTRAINT workprogram_tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE workprogram_baselines
  ADD CONSTRAINT workprogram_baselines_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE issues
  ADD CONSTRAINT issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_permits
  ADD CONSTRAINT project_permits_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_floors
  ADD CONSTRAINT project_floors_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_unit_completion
  ADD CONSTRAINT project_unit_completion_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_buildings
  ADD CONSTRAINT project_buildings_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_parking_floors
  ADD CONSTRAINT project_parking_floors_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_parking_unit_completion
  ADD CONSTRAINT project_parking_unit_completion_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE esa_issues
  ADD CONSTRAINT esa_issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_unit_types
  ADD CONSTRAINT project_unit_types_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_parking
  ADD CONSTRAINT project_parking_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_amenities
  ADD CONSTRAINT project_amenities_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE workprogram_activities
  ADD CONSTRAINT project_milestones_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE milestone_baselines
  ADD CONSTRAINT milestone_baselines_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE workprogram_dependencies
  ADD CONSTRAINT milestone_dependencies_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_poc
  ADD CONSTRAINT project_poc_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_poc_pending
  ADD CONSTRAINT project_poc_pending_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
