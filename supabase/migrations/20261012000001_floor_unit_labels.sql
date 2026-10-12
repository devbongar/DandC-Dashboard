-- Per-box labels for the Unit Completion grid.
--
-- 20261012000000 added per-tower column labels, which rename a whole column at
-- once. This adds the finer level: a label for an individual box, so a floor
-- can name its units differently from the rest of the tower.
--
-- Stored on the floor rather than on project_unit_completion, because a
-- completion row only exists once a unit has a status set -- naming an unstarted
-- unit would otherwise have to invent completion rows. Floors always exist.
--
-- A jsonb array of strings, position 0 = column 1, same shape as the tower's
-- array. Resolution order for a box is: this floor's label, then the tower's
-- column label, then the generated number. Blank entries fall through, so
-- clearing a cell restores the inherited label.
--
-- Covers both grids: residential and parking floors are both rows here.

ALTER TABLE project_location_floors
  ADD COLUMN IF NOT EXISTS unit_labels jsonb;
