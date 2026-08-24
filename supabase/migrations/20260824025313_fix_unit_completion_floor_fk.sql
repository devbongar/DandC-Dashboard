-- Re-point floor_id FK from old project_floors to project_location_floors
-- New floors created via the Development tab only exist in project_location_floors,
-- causing FK violations on insert for project_unit_completion.

ALTER TABLE project_unit_completion
  DROP CONSTRAINT project_unit_completion_floor_id_fkey,
  ADD CONSTRAINT project_unit_completion_floor_id_fkey
    FOREIGN KEY (floor_id) REFERENCES project_location_floors(id) ON DELETE CASCADE;

ALTER TABLE project_parking_unit_completion
  DROP CONSTRAINT project_parking_unit_completion_floor_id_fkey,
  ADD CONSTRAINT project_parking_unit_completion_floor_id_fkey
    FOREIGN KEY (floor_id) REFERENCES project_location_floors(id) ON DELETE CASCADE;
