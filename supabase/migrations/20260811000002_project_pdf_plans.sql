create table if not exists project_pdf_plans (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references projects(id) on delete cascade,
  name        text not null,
  url         text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists project_pdf_plans_project_id_idx
  on project_pdf_plans (project_id);

alter table project_pdf_plans enable row level security;

create policy "pdf_plans_select" on project_pdf_plans
  for select using (auth.role() = 'authenticated');

create policy "pdf_plans_insert" on project_pdf_plans
  for insert with check (auth.role() = 'authenticated');

create policy "pdf_plans_update" on project_pdf_plans
  for update using (auth.role() = 'authenticated');

create policy "pdf_plans_delete" on project_pdf_plans
  for delete using (auth.role() = 'authenticated');
