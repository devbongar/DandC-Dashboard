create table if not exists project_photos (
  id           uuid        primary key default gen_random_uuid(),
  project_id   uuid        not null references projects(id) on delete cascade,
  storage_path text        not null,
  file_name    text        not null,
  caption      text,
  tags         text[]      not null default '{}',
  photo_date   date        not null default current_date,
  created_at   timestamptz not null default now()
);

create index if not exists project_photos_project_id_idx on project_photos(project_id);
