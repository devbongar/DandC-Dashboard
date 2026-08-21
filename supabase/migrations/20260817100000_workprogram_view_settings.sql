create table if not exists project_workprogram_view (
  project_id text primary key references projects(id) on delete cascade,
  settings   jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table project_workprogram_view enable row level security;

drop policy if exists "Authenticated users can read workprogram view"   on project_workprogram_view;
drop policy if exists "Authenticated users can insert workprogram view" on project_workprogram_view;
drop policy if exists "Authenticated users can update workprogram view" on project_workprogram_view;

create policy "Authenticated users can read workprogram view"
  on project_workprogram_view for select
  to authenticated
  using (true);

create policy "Authenticated users can insert workprogram view"
  on project_workprogram_view for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update workprogram view"
  on project_workprogram_view for update
  to authenticated
  using (true);
