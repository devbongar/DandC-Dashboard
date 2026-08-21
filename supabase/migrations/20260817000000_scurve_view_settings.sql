create table if not exists project_scurve_view (
  project_id text primary key references projects(id) on delete cascade,
  settings   jsonb not null default '{}',
  date_range jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table project_scurve_view enable row level security;

drop policy if exists "Authenticated users can read scurve view"   on project_scurve_view;
drop policy if exists "Authenticated users can upsert scurve view" on project_scurve_view;
drop policy if exists "Authenticated users can update scurve view" on project_scurve_view;

create policy "Authenticated users can read scurve view"
  on project_scurve_view for select
  to authenticated
  using (true);

create policy "Authenticated users can upsert scurve view"
  on project_scurve_view for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update scurve view"
  on project_scurve_view for update
  to authenticated
  using (true);
