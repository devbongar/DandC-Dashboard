alter table projects
  add column if not exists num_towers integer,
  add column if not exists floors_per_tower integer,
  add column if not exists units_per_floor integer,
  add column if not exists total_units integer;
