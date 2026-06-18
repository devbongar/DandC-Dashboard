-- project_poc: approved POC values, one row per project per month
create table if not exists project_poc (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  period_date   date not null,
  target_pct    numeric(5,2),
  actual_pct    numeric(5,2),
  projected_pct numeric(5,2),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (project_id, period_date)
);

-- project_poc_pending: field-level pending edits awaiting admin approval
create table if not exists project_poc_pending (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  period_date   date not null,
  field         text not null check (field in ('target_pct', 'actual_pct', 'projected_pct')),
  old_value     numeric(5,2),
  new_value     numeric(5,2) not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by  uuid references auth.users(id),
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz default now()
);

-- indexes for common query patterns
create index if not exists idx_poc_project_id on project_poc(project_id);
create index if not exists idx_poc_pending_project_status on project_poc_pending(project_id, status);
