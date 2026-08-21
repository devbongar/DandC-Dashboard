create table if not exists project_unit_type_photos (
  id          uuid primary key default gen_random_uuid(),
  unit_type_id uuid not null references project_unit_types(id) on delete cascade,
  url         text not null,
  label       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists project_unit_type_photos_unit_type_id_idx
  on project_unit_type_photos (unit_type_id);

alter table project_unit_type_photos enable row level security;

drop policy if exists "unit_type_photos_select" on project_unit_type_photos;
drop policy if exists "unit_type_photos_insert" on project_unit_type_photos;
drop policy if exists "unit_type_photos_update" on project_unit_type_photos;
drop policy if exists "unit_type_photos_delete" on project_unit_type_photos;

create policy "unit_type_photos_select" on project_unit_type_photos
  for select using (auth.role() = 'authenticated');

create policy "unit_type_photos_insert" on project_unit_type_photos
  for insert with check (auth.role() = 'authenticated');

create policy "unit_type_photos_update" on project_unit_type_photos
  for update using (auth.role() = 'authenticated');

create policy "unit_type_photos_delete" on project_unit_type_photos
  for delete using (auth.role() = 'authenticated');
