-- Create project_location_groups: generalizes residential/parking/custom floor groups per building
CREATE TABLE IF NOT EXISTS project_location_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES project_buildings(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'custom' CHECK (type IN ('residential', 'parking', 'custom')),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_location_groups_building_idx ON project_location_groups (building_id);
CREATE INDEX IF NOT EXISTS project_location_groups_project_idx  ON project_location_groups (project_id);

-- Create project_location_floors: unified floor table (replaces project_floors + project_parking_floors)
-- IDs are preserved from old tables so project_unit_completion.floor_id FKs remain valid
CREATE TABLE IF NOT EXISTS project_location_floors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  building_id      uuid NOT NULL REFERENCES project_buildings(id) ON DELETE CASCADE,
  group_id         uuid NOT NULL REFERENCES project_location_groups(id) ON DELETE CASCADE,
  physical_level   text NOT NULL,
  num_units        integer,
  m4_planned_start date,
  m4_planned_end   date,
  m5_planned_start date,
  m5_planned_end   date,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_location_floors_group_idx   ON project_location_floors (group_id);
CREATE INDEX IF NOT EXISTS project_location_floors_project_idx ON project_location_floors (project_id);

-- Backfill: create a Residential group for every existing building
INSERT INTO project_location_groups (project_id, building_id, name, type, sort_order)
SELECT project_id, id, 'Residential', 'residential', 0
FROM project_buildings
ON CONFLICT DO NOTHING;

-- Backfill: create Parking groups only for buildings that have parking floors
INSERT INTO project_location_groups (project_id, building_id, name, type, sort_order)
SELECT DISTINCT f.project_id, f.building_id, 'Parking', 'parking', 1
FROM project_parking_floors f
ON CONFLICT DO NOTHING;

-- Migrate project_floors -> project_location_floors preserving UUIDs
INSERT INTO project_location_floors (id, project_id, building_id, group_id, physical_level, num_units, m4_planned_start, m4_planned_end, m5_planned_start, m5_planned_end, sort_order)
SELECT f.id, f.project_id, f.building_id, g.id,
       f.physical_level, f.num_units,
       f.m4_planned_start, f.m4_planned_end,
       f.m5_planned_start, f.m5_planned_end,
       f.sort_order
FROM project_floors f
JOIN project_location_groups g ON g.building_id = f.building_id AND g.type = 'residential'
ON CONFLICT (id) DO NOTHING;

-- Migrate project_parking_floors -> project_location_floors preserving UUIDs
INSERT INTO project_location_floors (id, project_id, building_id, group_id, physical_level, num_units, m4_planned_start, m4_planned_end, m5_planned_start, m5_planned_end, sort_order)
SELECT f.id, f.project_id, f.building_id, g.id,
       f.physical_level, f.num_units,
       f.m4_planned_start, f.m4_planned_end,
       f.m5_planned_start, f.m5_planned_end,
       f.sort_order
FROM project_parking_floors f
JOIN project_location_groups g ON g.building_id = f.building_id AND g.type = 'parking'
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE project_location_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_location_floors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lg_select ON project_location_groups;
DROP POLICY IF EXISTS lg_insert ON project_location_groups;
DROP POLICY IF EXISTS lg_update ON project_location_groups;
DROP POLICY IF EXISTS lg_delete ON project_location_groups;

CREATE POLICY lg_select ON project_location_groups FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY lg_insert ON project_location_groups FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY lg_update ON project_location_groups FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY lg_delete ON project_location_groups FOR DELETE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS lf_select ON project_location_floors;
DROP POLICY IF EXISTS lf_insert ON project_location_floors;
DROP POLICY IF EXISTS lf_update ON project_location_floors;
DROP POLICY IF EXISTS lf_delete ON project_location_floors;

CREATE POLICY lf_select ON project_location_floors FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY lf_insert ON project_location_floors FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY lf_update ON project_location_floors FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY lf_delete ON project_location_floors FOR DELETE USING (auth.role() = 'authenticated');
