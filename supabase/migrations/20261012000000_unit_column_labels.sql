-- Custom column labels for the Unit Completion grid.
--
-- The grid's header and every box showed `String(index + 1).padStart(2, '0')`
-- -- "01", "02", "03" -- derived from the column position, so nothing could be
-- renamed. Teams label units per tower ("A", "B", "PH-1"), so the labels are
-- stored per building and apply to both that tower's grids.
--
-- A jsonb array of strings, one per column, position 0 = column 1. A null
-- array, a short array or a null/empty entry falls back to the generated
-- number, so existing projects are unaffected until someone types a label.
-- `unit_number` stays an integer: it is the completion row's key, and only the
-- display changes.

ALTER TABLE project_buildings
  ADD COLUMN IF NOT EXISTS unit_column_labels    jsonb,
  ADD COLUMN IF NOT EXISTS parking_column_labels jsonb;
